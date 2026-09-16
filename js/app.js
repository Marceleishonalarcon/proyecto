document.addEventListener('DOMContentLoaded', () => {
    // --- MIGRACIÓN DE DATOS Y ESTADO ---
    let inventarioRaw = JSON.parse(localStorage.getItem('tienda_inventario')) || [];
    
    let inventario = inventarioRaw.map(p => {
        if (!p.color) p.color = "No especificado";
        if (p.talla && !p.tallas) {
            const oldTalla = p.talla;
            p.tallas = { XS: 0, S: 0, M: 0, L: 0, XL: 0, XXL: 0 };
            p.tallas[oldTalla] = p.stock || 0;
            p.stockTotal = p.stock || 0;
            delete p.talla;
            delete p.stock;
        }
        return p;
    });
    
    const regexSoloLetras = /^[A-Za-záéíóúÁÉÍÓÚñÑ\s]+$/;
    let alertTimeouts = { inv: null, ven: null, modal: null };
    let productoEnEdicion = null;

    // --- ELEMENTOS DEL DOM ---
    const navButtons = document.querySelectorAll('.nav-btn');
    const sections = document.querySelectorAll('.section');
    
    const formProducto = document.getElementById('form-producto');
    const formVenta = document.getElementById('form-venta');
    const inputBuscar = document.getElementById('p-buscar');
    
    const selectVentaCodigo = document.getElementById('v-codigo');
    const selectVentaTalla = document.getElementById('v-talla');

    const tablaProductos = document.getElementById('tabla-productos');
    const tablaDisponibilidad = document.getElementById('tabla-disponibilidad');

    const inputNombre = document.getElementById('p-nombre');
    const inputColor = document.getElementById('p-color');
    const inputCodigo = document.getElementById('p-codigo');
    const inputPrecio = document.getElementById('p-precio');
    const inputCantidad = document.getElementById('v-cantidad');
    const stockInputs = document.querySelectorAll('.stock-input');

    // Nodos del Modal Edit
    const modalRestock = document.getElementById('modal-restock');
    const btnCloseModal = document.getElementById('btn-close-modal');
    const btnSaveRestock = document.getElementById('btn-save-restock');
    const rsTallasGrid = document.getElementById('rs-tallas-grid');
    const rsNombreTitle = document.getElementById('rs-nombre-title');
    const rsColorInput = document.getElementById('rs-color');

    // Utilidades de validación
    const bloquearSignos = (e) => {
        if (e.key === '-' || e.key === '+') {
            e.preventDefault();
        }
    };
    const limpiarSignos = function() {
        if (this.value.includes('-') || this.value.includes('+')) {
            this.value = this.value.replace(/[-+]/g, '');
        }
    };
    const limpiarNumeros = function() {
        this.value = this.value.replace(/[0-9]/g, '');
    };

    // --- INICIALIZACIÓN ---
    function init() {
        asignarEventos();
        renderizarTablaProductos();
    }

    // --- EVENTOS ---
    function asignarEventos() {
        navButtons.forEach(btn => {
            btn.addEventListener('click', (e) => cambiarPestana(e.target));
        });

        formProducto.addEventListener('submit', manejarRegistroProducto);
        formVenta.addEventListener('submit', manejarVenta);
        inputBuscar.addEventListener('input', renderizarTablaProductos);
        selectVentaCodigo.addEventListener('change', actualizarSelectTallas);

        // Delegación de eventos (Editar / Borrar)
        tablaProductos.addEventListener('click', (e) => {
            if(e.target.classList.contains('btn-edit')) {
                abrirModalRestock(e.target.dataset.codigo);
            }
            if(e.target.classList.contains('btn-delete')) {
                borrarProducto(e.target.dataset.codigo);
            }
        });

        // Eventos Modal
        btnCloseModal.addEventListener('click', cerrarModal);
        btnSaveRestock.addEventListener('click', guardarRestock);

        // Validaciones en tiempo real
        inputNombre.addEventListener('input', limpiarNumeros);
        inputColor.addEventListener('input', limpiarNumeros);
        rsColorInput.addEventListener('input', limpiarNumeros); 

        inputCodigo.addEventListener('input', function() {
            let rawValue = this.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
            rawValue = rawValue.substring(0, 6);
            if (rawValue.length > 3) {
                this.value = rawValue.substring(0, 3) + '-' + rawValue.substring(3);
            } else {
                this.value = rawValue;
            }
        });

        inputPrecio.addEventListener('keydown', bloquearSignos);
        inputPrecio.addEventListener('input', limpiarSignos);
        inputCantidad.addEventListener('keydown', bloquearSignos);
        inputCantidad.addEventListener('input', limpiarSignos);

        stockInputs.forEach(input => {
            input.addEventListener('keydown', bloquearSignos);
            input.addEventListener('input', limpiarSignos);
        });
    }

    // --- LÓGICA DE INTERFAZ ---
    function cambiarPestana(botonActivo) {
        const targetId = botonActivo.dataset.target;
        
        navButtons.forEach(btn => btn.classList.remove('active'));
        botonActivo.classList.add('active');

        sections.forEach(sec => {
            if(sec.id === targetId) {
                sec.classList.add('active');
            } else {
                sec.classList.remove('active');
            }
        });

        if (targetId === 'ventas') {
            actualizarSelectVentas();
            renderizarTablaDisponibilidad();
        }
    }

    function mostrarAlerta(containerId, mensaje, tipo) {
        const container = document.getElementById(containerId);
        container.textContent = mensaje;
        container.className = `alert ${tipo}`; 
        
        const alertKey = containerId.includes('inv') ? 'inv' : (containerId.includes('ven') ? 'ven' : 'modal');
        clearTimeout(alertTimeouts[alertKey]);
        
        alertTimeouts[alertKey] = setTimeout(() => {
            container.classList.add('hidden');
        }, 4000);
    }

    // --- LÓGICA DE BORRADO ---
    function borrarProducto(codigo) {
        const confirmacion = confirm(`¿Estás seguro de que deseas ELIMINAR el producto con código ${codigo}?\n\nEsta acción eliminará su stock y no se puede deshacer.`);
        
        if (confirmacion) {
            inventario = inventario.filter(p => p.codigo !== codigo);
            guardarInventario();
            mostrarAlerta('inv-alert', `El producto ${codigo} fue eliminado del sistema.`, 'success');
            
            // Refrescar vistas
            renderizarTablaProductos();
            actualizarSelectVentas();
            renderizarTablaDisponibilidad();
        }
    }

    // --- LÓGICA DE EDICIÓN / RESTOCK (MODAL) ---
    function abrirModalRestock(codigo) {
        const producto = inventario.find(p => p.codigo === codigo);
        if (!producto) return;
        
        productoEnEdicion = codigo;
        rsNombreTitle.textContent = producto.nombre;
        
        rsColorInput.value = producto.color === "No especificado" ? "" : producto.color;
        
        rsTallasGrid.innerHTML = '';
        
        Object.keys(producto.tallas).forEach(talla => {
            const div = document.createElement('div');
            div.className = 'talla-item';
            div.innerHTML = `
                <label>${talla}</label>
                <input type="number" class="rs-stock-input" data-talla="${talla}" value="${producto.tallas[talla]}" min="0">
            `;
            rsTallasGrid.appendChild(div);
        });

        document.querySelectorAll('.rs-stock-input').forEach(input => {
            input.addEventListener('keydown', bloquearSignos);
            input.addEventListener('input', limpiarSignos);
        });

        modalRestock.classList.remove('hidden');
    }

    function cerrarModal() {
        modalRestock.classList.add('hidden');
        productoEnEdicion = null;
    }

    function guardarRestock() {
        if (!productoEnEdicion) return;
        
        const producto = inventario.find(p => p.codigo === productoEnEdicion);
        
        const nuevoColor = rsColorInput.value.trim();
        if (!nuevoColor || !regexSoloLetras.test(nuevoColor)) {
            return mostrarAlerta('modal-alert', 'Error: El color es obligatorio y solo debe contener texto.', 'error');
        }

        let stockTotal = 0;
        let hasInvalidStock = false;
        const nuevosInputs = document.querySelectorAll('.rs-stock-input');
        
        nuevosInputs.forEach(input => {
            const stockVal = parseFloat(input.value);
            const stock = isNaN(stockVal) ? 0 : stockVal;
            
            if (!Number.isInteger(stock) || stock < 0) {
                hasInvalidStock = true;
            }
            stockTotal += stock;
        });

        if (hasInvalidStock) {
            return mostrarAlerta('modal-alert', 'Error: El stock debe ser en números enteros mayores o iguales a 0.', 'error');
        }
        if (stockTotal <= 0) {
            return mostrarAlerta('modal-alert', 'Error: Debe existir stock mayor a 0 en al menos una talla.', 'error');
        }

        producto.color = nuevoColor;
        
        nuevosInputs.forEach(input => {
            const talla = input.dataset.talla;
            const stock = parseFloat(input.value) || 0;
            producto.tallas[talla] = stock;
        });
        
        producto.stockTotal = stockTotal;
        guardarInventario();
        
        cerrarModal();
        mostrarAlerta('inv-alert', `Producto ${producto.nombre} actualizado correctamente.`, 'success');
        
        renderizarTablaProductos();
        actualizarSelectVentas();
        renderizarTablaDisponibilidad();
    }

    // --- LÓGICA DE REGISTRO / VENTA ---
    function manejarRegistroProducto(e) {
        e.preventDefault();

        const codigo = inputCodigo.value.trim();
        const nombre = inputNombre.value.trim();
        const color = inputColor.value.trim();
        const precio = parseFloat(inputPrecio.value);
        
        let tallas = {};
        let stockTotal = 0;
        let hasInvalidStock = false;

        stockInputs.forEach(input => {
            const talla = input.dataset.talla;
            const stockVal = parseFloat(input.value);
            const stock = isNaN(stockVal) ? 0 : stockVal;
            
            if (!Number.isInteger(stock) || stock < 0) hasInvalidStock = true;
            tallas[talla] = stock;
            stockTotal += stock;
        });

        if (!codigo || !nombre || !color || isNaN(precio)) {
            return mostrarAlerta('inv-alert', 'Error: Faltan campos obligatorios.', 'error');
        }
        if (!regexSoloLetras.test(nombre) || !regexSoloLetras.test(color)) {
            return mostrarAlerta('inv-alert', 'Error: El nombre y el color solo deben contener texto.', 'error');
        }
        if (precio <= 0) {
            return mostrarAlerta('inv-alert', 'Error: El precio debe ser un valor positivo.', 'error');
        }
        if (hasInvalidStock) {
            return mostrarAlerta('inv-alert', 'Error: El stock debe ser entero y mayor o igual a 0.', 'error');
        }
        if (stockTotal <= 0) {
            return mostrarAlerta('inv-alert', 'Error: Debe ingresar stock en al menos una talla.', 'error');
        }

        const existeCodigo = inventario.some(p => p.codigo === codigo);
        if (existeCodigo) {
            return mostrarAlerta('inv-alert', `Error: Ya existe un producto con el código ${codigo}.`, 'error');
        }

        const nuevoProducto = { codigo, nombre, color, precio, tallas, stockTotal };
        inventario.push(nuevoProducto);
        guardarInventario();

        formProducto.reset();
        mostrarAlerta('inv-alert', 'Producto registrado exitosamente.', 'success');
        renderizarTablaProductos();
    }

    function manejarVenta(e) {
        e.preventDefault();

        const codigo = selectVentaCodigo.value;
        const talla = selectVentaTalla.value;
        const cantidad = parseFloat(inputCantidad.value);

        if (!codigo || !talla) {
            return mostrarAlerta('ven-alert', 'Error: Debe seleccionar un producto y talla.', 'error');
        }
        if (!Number.isInteger(cantidad) || cantidad <= 0) {
            return mostrarAlerta('ven-alert', 'Error: La cantidad debe ser mayor que 0.', 'error');
        }

        const indexProducto = inventario.findIndex(p => p.codigo === codigo);
        if (indexProducto === -1) return;

        const producto = inventario[indexProducto];

        if (cantidad > producto.tallas[talla]) {
            return mostrarAlerta('ven-alert', `Error: La cantidad supera el stock de la talla ${talla} (${producto.tallas[talla]} ud).`, 'error');
        }

        producto.tallas[talla] -= cantidad;
        producto.stockTotal -= cantidad;
        guardarInventario();

        formVenta.reset();
        selectVentaTalla.innerHTML = '<option value="">-- Seleccione producto primero --</option>';
        selectVentaTalla.disabled = true;

        mostrarAlerta('ven-alert', `Venta procesada: ${cantidad} unidades (Talla: ${talla}).`, 'success');
        
        actualizarSelectVentas();
        renderizarTablaDisponibilidad();
        renderizarTablaProductos();
    }

    // --- RENDERIZADO DOM ---
    function renderizarTablaProductos() {
        const termino = inputBuscar.value.toLowerCase();
        tablaProductos.innerHTML = '';

        const filtrados = inventario.filter(p => {
            const coincideNombre = p.nombre.toLowerCase().includes(termino);
            const coincideColor = p.color.toLowerCase().includes(termino);
            const coincideTalla = Object.keys(p.tallas).some(t => 
                t.toLowerCase().includes(termino) && p.tallas[t] > 0
            );
            return coincideNombre || coincideColor || coincideTalla;
        });

        if (filtrados.length === 0) {
            tablaProductos.innerHTML = '<tr><td colspan="7" style="text-align:center; color:#828c91;">No se encontraron productos coincidentes.</td></tr>';
            return;
        }

        filtrados.forEach(p => {
            const tallasFormateadas = Object.entries(p.tallas)
                .filter(([_, stock]) => stock > 0)
                .map(([talla, stock]) => `<span class="badge">${talla}: ${stock}</span>`)
                .join('');
                
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><strong>${p.codigo}</strong></td>
                <td>${p.nombre}</td>
                <td>${p.color}</td>
                <td>${tallasFormateadas || '<span class="badge" style="background:#fdf2f2;color:#9c4141;">Agotado</span>'}</td>
                <td>$${p.precio.toFixed(2)}</td>
                <td class="${p.stockTotal === 0 ? 'stock-low' : ''}">${p.stockTotal}</td>
                <td class="acciones-cell">
                    <button class="btn-edit" data-codigo="${p.codigo}">✏️ Editar</button>
                    <button class="btn-delete" data-codigo="${p.codigo}">🗑️ Borrar</button>
                </td>
            `;
            tablaProductos.appendChild(tr);
        });
    }

    function actualizarSelectVentas() {
        selectVentaCodigo.innerHTML = '<option value="">-- Seleccione un producto --</option>';
        selectVentaTalla.innerHTML = '<option value="">-- Seleccione producto primero --</option>';
        selectVentaTalla.disabled = true;
        
        inventario.forEach(p => {
            const option = document.createElement('option');
            option.value = p.codigo;
            option.textContent = `[${p.codigo}] ${p.nombre} (${p.color}) - Stock: ${p.stockTotal}`;
            if(p.stockTotal === 0) option.disabled = true;
            selectVentaCodigo.appendChild(option);
        });
    }

    function actualizarSelectTallas() {
        const codigo = selectVentaCodigo.value;
        selectVentaTalla.innerHTML = '<option value="">-- Seleccione talla --</option>';
        
        if (!codigo) {
            selectVentaTalla.disabled = true;
            return;
        }

        const producto = inventario.find(p => p.codigo === codigo);
        if (producto) {
            selectVentaTalla.disabled = false;
            let tallasDisponibles = false;
            
            for (const [talla, stock] of Object.entries(producto.tallas)) {
                if (stock > 0) {
                    tallasDisponibles = true;
                    const option = document.createElement('option');
                    option.value = talla;
                    option.textContent = `${talla} (Disponible: ${stock})`;
                    selectVentaTalla.appendChild(option);
                }
            }
            
            if (!tallasDisponibles) {
                selectVentaTalla.disabled = true;
                selectVentaTalla.innerHTML = '<option value="">-- Sin tallas disponibles --</option>';
            }
        }
    }

    function renderizarTablaDisponibilidad() {
        tablaDisponibilidad.innerHTML = '';
        inventario.forEach(p => {
            const tallasFormateadas = Object.entries(p.tallas)
                .filter(([_, stock]) => stock > 0)
                .map(([talla, _]) => `<span class="badge">${talla}</span>`)
                .join('');
                
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${p.codigo}</td>
                <td>${p.nombre}</td>
                <td>${p.color}</td>
                <td>${tallasFormateadas || '-'}</td>
                <td class="${p.stockTotal <= 5 ? 'stock-low' : ''}">${p.stockTotal} ud.</td>
            `;
            tablaDisponibilidad.appendChild(tr);
        });
    }

    // --- PERSISTENCIA DE DATOS ---
    function guardarInventario() {
        localStorage.setItem('tienda_inventario', JSON.stringify(inventario));
    }

    init();
});
