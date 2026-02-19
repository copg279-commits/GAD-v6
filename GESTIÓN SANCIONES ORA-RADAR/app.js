const CORREO_SANCIONES = "unidad.sanciones@alicante.es";

const DEFAULT_HELP_HTML = `
    <div class="help-section" style="border-left-color: #3b82f6;">
        <h3><span class="help-icon">🚀</span> 1. Primeros Pasos e Importación</h3>
        <p>Para empezar a trabajar, necesitas alimentar el sistema con los datos de las multas (Excel).</p>
        <ul class="help-list">
            <li><b>Formato Excel:</b> El archivo debe contener columnas como <code>Matrícula</code>, <code>Fecha</code>, <code>Hora</code>, <code>Lugar</code>, <code>Marca</code>, <code>Modelo</code>.</li>
            <li><b>Importar:</b> Arrastra el archivo al recuadro de línea discontinua que dice <b>"SOLTAR EXCEL AQUÍ"</b>.</li>
            <li><b>Detección Automática:</b> El sistema detectará si estás en modo ORA o RADAR y asignará las multas a ese modo.</li>
            <li><b>Duplicados:</b> Si importas un Excel con multas que ya existen, el sistema las ignora automáticamente para no repetir datos.</li>
        </ul>
    </div>

    <div class="help-section" style="border-left-color: #e74c3c;">
        <h3><span class="help-icon">👀</span> 2. Lectura de la Tarjeta de Vehículo</h3>
        <p>Cada franja horizontal representa un vehículo (Matrícula) agrupando todas sus infracciones.</p>
        <ul class="help-list">
            <li><button class="btn-primary" style="display:inline-block; width:24px; height:24px; padding:0;"><i class="fas fa-copy"></i></button> <b>Copiar:</b> Copia la matrícula al portapapeles.</li>
            <li><button class="btn-warning" style="display:inline-block; width:24px; height:24px; padding:0;"><i class="fas fa-pen"></i></button> <b>Editar:</b> Permite corregir la Marca y Modelo del coche si están vacíos o erróneos.</li>
            <li><b>Color Rojo (Reincidente):</b> Si la matrícula aparece en fondo rojo, significa que ese vehículo tiene 2 o más infracciones acumuladas.</li>
            <li><b>Desplegar:</b> Haz clic en cualquier parte blanca de la tarjeta para ver el listado detallado de multas (Fechas, Lugares, Horas).</li>
        </ul>
    </div>

    <div class="help-section" style="border-left-color: #f1c40f;">
        <h3><span class="help-icon">🚦</span> 3. Gestión de Estados (Flujo de Trabajo)</h3>
        <p>Usa los botones ovalados a la derecha de cada tarjeta ("Chips") para gestionar el estado del expediente:</p>
        <ul class="help-list">
            <li><span class="status-chip chip-sd active">SIN DATOS</span>: Márcálo si has consultado en <b>Eurocop</b> y el vehículo no aparece o no tiene datos relevantes.</li>
            <li><span class="status-chip chip-al active">ALERTA</span>: Al pulsar este botón, <b>se copia automáticamente</b> al portapapeles el texto legal para solicitar la inmovilización/depósito por reincidencia (Art 87.5 LSV). Pégalo en la incidencia de Eurocop.</li>
            <li><span class="status-chip chip-no active">NOTIFICADO</span>: Abre un formulario para rellenar los datos del conductor identificado. Al guardar, <b>se abre el correo electrónico</b> automáticamente con todos los datos listos para enviar a Sanciones.</li>
        </ul>
    </div>

    <div class="help-section" style="border-left-color: #8b5cf6;">
        <h3><span class="help-icon">⚙️</span> 4. Filtros y Herramientas</h3>
        <ul class="help-list">
            <li><b>Filtro Pendientes:</b> Muestra solo los vehículos que aún no has trabajado (ni notificados, ni descartados por Sin Datos).</li>
            <li><b>Deshacer Cambio:</b> Si borras algo por error o cambias un estado sin querer, pulsa este botón para volver atrás.</li>
            <li><b>Buscador:</b> Escribe parte de la matrícula para filtrar la lista en tiempo real.</li>
            <li><b>Añadir Manualmente:</b> Introduce una matrícula sin necesidad de Excel. Se asignará automáticamente al modo activo (ORA o RADAR).</li>
        </ul>
    </div>
`;

let allData = [];
let historyStack = [];
let mode = 'ORA'; 
let filter = 'all';
let sort = 'date';

function formatDate(isoStr) {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "---";
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
}

function setMode(m) {
    mode = m;
    document.body.className = m === 'ORA' ? 'mode-ora' : 'mode-radar';
    document.getElementById('b-ora').classList.toggle('active', m === 'ORA');
    document.getElementById('b-radar').classList.toggle('active', m === 'RADAR');
    
    const title = document.getElementById('main-t');
    const hint = document.getElementById('manual-mode-hint');
    
    if(m === 'ORA') {
        title.innerHTML = '<i class="fas fa-file-invoice-dollar"></i> Listado de denuncias ORA';
        if(hint) hint.innerHTML = 'Se añadirá como denuncia <b>ORA</b>';
    } else {
        title.innerHTML = '<i class="fas fa-tachometer-alt"></i> Gestión de denuncias RADAR';
        if(hint) hint.innerHTML = 'Se añadirá como denuncia <b>RADAR</b>';
    }
    
    if(m === 'RADAR') sort = 'plate';
    else sort = 'date';
    
    render();
}

database.ref(DB_REF).on('value', snap => {
    const val = snap.val();
    let rawList = val ? (Array.isArray(val) ? val : Object.values(val)) : [];
    allData = rawList.map(d => { 
        if(!d.tipo) d.tipo = 'ORA'; 
        if(d.matricula) d.matricula = d.matricula.trim().replace(/\s/g,'').toUpperCase();
        return d; 
    });
    render();
});

function render() {
    const cont = document.getElementById('list-container');
    const search = document.getElementById('search-input').value.toUpperCase().trim();
    cont.innerHTML = '';

    const groups = {};
    allData.forEach(d => {
        if(!d.matricula) return;
        if(!groups[d.matricula]) groups[d.matricula] = { matricula: d.matricula, items: [], hasORA: false, hasRADAR: false };
        groups[d.matricula].items.push(d);
        if(d.tipo === 'ORA') groups[d.matricula].hasORA = true;
        if(d.tipo === 'RADAR') groups[d.matricula].hasRADAR = true;
    });

    let list = Object.values(groups).filter(g => {
        const belongs = (mode === 'ORA' && g.hasORA) || (mode === 'RADAR' && g.hasRADAR);
        const sMatch = g.matricula.includes(search);
        if(search) return sMatch;

        let fMatch = true;
        const relevantItems = g.items.filter(i => i.tipo === mode);
        if(filter === 'pending') fMatch = relevantItems.some(i => !i.notificado && !i.eurocop && !i.alerta);
        if(filter === 'reincident') fMatch = g.items.length > 1; 
        if(filter === 'eurocop') fMatch = relevantItems.length > 0 && relevantItems.every(i => i.eurocop);
        if(filter === 'notified') fMatch = relevantItems.some(i => i.notificado);
        return belongs && fMatch;
    });

    if(sort === 'count') list.sort((a,b) => b.items.length - a.items.length);
    else if(sort === 'plate') list.sort((a,b) => a.matricula.localeCompare(b.matricula));
    else list.sort((a,b) => Math.max(...b.items.map(i=>new Date(i.fecha))) - Math.max(...a.items.map(i=>new Date(i.fecha))));

    let countLabel = "Total";
    if(search) countLabel = "Búsqueda";
    else if(filter === 'pending') countLabel = "Pendientes";
    else if(filter === 'reincident') countLabel = "Reincidentes";
    
    const icon = mode === 'ORA' ? '<i class="fas fa-file-invoice-dollar"></i>' : '<i class="fas fa-tachometer-alt"></i>';
    document.getElementById('stats').innerHTML = `<span>${icon} ${countLabel}:</span> <span style="background:${mode==='ORA'?'#3b82f6':'#10b981'}; color:white; padding:4px 15px; border-radius:20px; font-weight:800;">${list.length}</span>`;

    list.forEach(g => {
        const isSD = g.items.every(i => i.eurocop);
        const isAL = g.items.some(i => i.alerta);
        const isNO = g.items.some(i => i.notificado);
        
        const totalGlobalCount = g.items.length;
        const isGlobalReincident = totalGlobalCount > 1;

        const maxDate = new Date(Math.max(...g.items.map(i=>new Date(i.fecha))));
        let badgeText = `${g.items.length} Exp.`;

        const displayMatricula = g.matricula;

        const card = document.createElement('div');
        card.className = 'vehicle-card';
        card.innerHTML = `
            <div class="card-header" onclick="this.nextElementSibling.classList.toggle('open')">
                <div class="left-col">
                    <button class="btn-primary header-btn-small" onclick="event.stopPropagation(); copyM('${g.matricula}')"><i class="fas fa-copy"></i></button>
                    <button class="btn-warning header-btn-small" onclick="event.stopPropagation(); openEditVehicleModal('${g.matricula}')" title="Editar Vehículo"><i class="fas fa-pen"></i></button>
                    <div class="plate-box ${isGlobalReincident ? 'reincident' : ''}">${displayMatricula}</div>
                    <div class="count-badge ${isGlobalReincident ? 'reincident' : ''}">${badgeText}</div>
                    <div style="font-size:0.8em; color:#6b7280; font-weight:600;"><i class="far fa-clock"></i> ${formatDate(maxDate)}</div>
                </div>
                <div style="display:flex; gap:6px" onclick="event.stopPropagation()">
                    <span class="status-chip chip-sd ${isSD?'active':''}" onclick="toggleS('${g.matricula}', 'eurocop')">Sin Datos</span>
                    <span class="status-chip chip-al ${isAL?'active':''}" onclick="toggleS('${g.matricula}', 'alerta')">Alerta</span>
                    <span class="status-chip chip-no ${isNO?'active':''}" onclick="openModal('${g.matricula}')">${isNO ? 'NOTIFICADO' : 'NOTIFICAR'}</span>
                    <i class="fas fa-trash" style="color:#ef4444; cursor:pointer; margin-left:8px; font-size:1em;" onclick="delV('${g.matricula}')" title="Borrar vehículo"></i>
                </div>
            </div>
            <div class="card-details">
                ${g.items.sort((a,b)=>new Date(b.fecha)-new Date(a.fecha)).map(i => `
                    <div class="detail-row">
                        <span>
                            <b style="margin-right:10px;">${formatDate(i.fecha)}</b>
                            ${i.tipo==='ORA'?'<span class="type-icon-p">P</span>':'<span class="type-icon-50">50</span>'}
                            <span style="color:#6b7280; margin-left:15px"><i class="fas fa-map-marker-alt"></i> ${i.lugar || 'Ubicación desconocida'}</span>
                        </span>
                        <div style="display:flex; align-items:center; gap:15px;">
                            <span style="font-weight:bold; color:#1f2937;">${i.marca || ''} ${i.modelo || ''}</span>
                            <i class="fas fa-trash-alt" style="color:#ef4444; cursor:pointer; opacity:0.6;" onclick="delRecord('${i.id}')" title="Borrar infracción"></i>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
        cont.appendChild(card);
    });
}

// --- EDICIÓN VEHÍCULO ---
window.openEditVehicleModal = function(matricula) {
    const rec = allData.find(d => d.matricula === matricula);
    document.getElementById('v-matricula').value = matricula;
    document.getElementById('v-marca').value = (rec && rec.marca) ? rec.marca : '';
    document.getElementById('v-modelo').value = (rec && rec.modelo) ? rec.modelo : '';
    document.getElementById('modal-overlay').style.display = 'block';
    document.getElementById('edit-vehicle-modal').style.display = 'block';
}

function saveVehicleData() {
    pushHistory();
    const mat = document.getElementById('v-matricula').value;
    const marca = document.getElementById('v-marca').value;
    const modelo = document.getElementById('v-modelo').value;
    let updatedCount = 0;
    allData.forEach(d => {
        if (d.matricula === mat) {
            d.marca = marca;
            d.modelo = modelo;
            updatedCount++;
        }
    });
    if (updatedCount > 0) database.ref(DB_REF).set(allData);
    closeModal('edit-vehicle-modal');
}

// ==========================================
// === NUEVA LÓGICA: AÑADIR MANUALMENTE ===
// ==========================================
function addManualPlate() {
    const input = document.getElementById('manual-plate');
    const rawValue = input.value;
    const plate = rawValue.trim().toUpperCase().replace(/\s/g, '');
    
    if (!plate) {
        alert("Por favor, introduce una matrícula válida.");
        return;
    }

    pushHistory();
    
    const fechaISO = new Date().toISOString();
    // Buscamos si la matrícula ya existía para copiar sus datos (marca, modelo, estados)
    const existingPlate = allData.find(old => old.matricula === plate);
    
    const newRecord = {
        id: btoa(plate + fechaISO + Math.random()), 
        matricula: plate,
        fecha: fechaISO,
        tipo: mode, // Guarda en ORA o RADAR según dónde esté el usuario
        lugar: 'Entrada Manual',
        marca: existingPlate ? existingPlate.marca : '',
        modelo: existingPlate ? existingPlate.modelo : '',
        eurocop: existingPlate ? existingPlate.eurocop : false,
        alerta: existingPlate ? existingPlate.alerta : false,
        notificado: existingPlate ? existingPlate.notificado : false,
        datos_titular: existingPlate ? (existingPlate.datos_titular || {}) : {}
    };
    
    allData.push(newRecord);
    database.ref(DB_REF).set(allData);
    
    input.value = ''; // Limpiamos la caja de texto
    alert(`✅ Matrícula ${plate} añadida correctamente a ${mode}.`);
}

// Permitir presionar "Enter" en la caja de texto
document.addEventListener('DOMContentLoaded', () => {
    const manualInput = document.getElementById('manual-plate');
    if(manualInput) {
        manualInput.addEventListener('keypress', function (e) {
            if (e.key === 'Enter') {
                addManualPlate();
            }
        });
    }
});

// ==========================================
// === LÓGICA EXCEL IMPORTADA DEL BACKUP ===
// ==========================================
function sanitizeKey(key) {
    if (!key) return '';
    return key.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[.$#\[\]\/]/g, '_').replace(/\s/g, '_');
}

function getCanonicalKey(sanitizedKey) {
    if (sanitizedKey === 'matricula' || sanitizedKey === 'placa') return 'matricula';
    if (sanitizedKey.includes('fecha')) return 'fecha';
    if (sanitizedKey === 'marca') return 'marca';
    if (sanitizedKey === 'modelo') return 'modelo';
    if (sanitizedKey === 'calle' || sanitizedKey === 'lugar' || sanitizedKey === 'ubicacion') return 'lugar';
    return null;
}

function extraerDatosExcel(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
                const jsonData = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
                
                const sanitized = jsonData.map(row => {
                    const newRow = {};
                    Object.keys(row).forEach(k => {
                        const ck = getCanonicalKey(sanitizeKey(k));
                        if (ck) {
                            let v = row[k];
                            if (ck === 'fecha') {
                                if (v instanceof Date) newRow[ck] = v;
                                else if (typeof v === 'number') newRow[ck] = new Date(Math.round((v - 25569) * 86400 * 1000));
                                else newRow[ck] = new Date(v);
                            } else {
                                newRow[ck] = v;
                            }
                        }
                    });
                    if(row['Hora denuncia'] && newRow.fecha) {
                        const [h, m] = row['Hora denuncia'].toString().split(':');
                        if(h && m) newRow.fecha.setHours(h, m);
                    }
                    return newRow;
                });

                const validRows = [];
                const discardedPlates = [];

                sanitized.forEach(row => {
                    if (!row.matricula) return;
                    const p = String(row.matricula).trim().replace(/\s/g, '').toUpperCase();
                    row.matricula = p;

                    const isModern = /^\d{4}[A-Z]{3}$/i.test(p);
                    const isOld = /^[A-Z]{1,2}\d{4}[A-Z]{1,2}$/i.test(p);

                    if (!isModern && !isOld) {
                        validRows.push(row);
                    } else {
                        discardedPlates.push(p);
                    }
                });

                resolve({ validRows, discardedPlates });
            } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
    });
}

async function handleImport(file) {
    pushHistory();
    try {
        const { validRows, discardedPlates } = await extraerDatosExcel(file);
        
        let addedCount = 0;
        let duplicateCount = 0;

        validRows.forEach(n => {
            const fechaISO = n.fecha instanceof Date ? n.fecha.toISOString() : new Date().toISOString();
            
            const isExactDuplicate = allData.some(old => 
                old.matricula === n.matricula && 
                old.tipo === mode && 
                Math.abs(new Date(old.fecha).getTime() - new Date(fechaISO).getTime()) < 60000
            );

            if (isExactDuplicate) {
                duplicateCount++;
            } else {
                const existingPlate = allData.find(old => old.matricula === n.matricula);
                
                const newRecord = {
                    id: btoa(n.matricula + fechaISO + Math.random()), 
                    matricula: n.matricula,
                    fecha: fechaISO,
                    tipo: mode, 
                    lugar: n.lugar || '',
                    marca: n.marca || '',
                    modelo: n.modelo || '',
                    eurocop: existingPlate ? existingPlate.eurocop : false,
                    alerta: existingPlate ? existingPlate.alerta : false,
                    notificado: existingPlate ? existingPlate.notificado : false,
                    datos_titular: existingPlate ? (existingPlate.datos_titular || {}) : {}
                };
                
                allData.push(newRecord);
                addedCount++;
            }
        });

        if(addedCount > 0) database.ref(DB_REF).set(allData);
        
        let msg = `Importación (${mode}):\n✅ ${addedCount} añadidos.\n⚠️ ${duplicateCount} duplicados omitidos.`;
        
        if (discardedPlates.length > 0) {
            msg += `\n⛔ ${discardedPlates.length} matrículas españolas descartadas.`;
        }

        alert(msg);

    } catch (error) {
        console.error(error);
        alert("Error al leer el archivo. Asegúrate de que es un Excel válido.");
        historyStack.pop();
    }
}

// --- COMUNES ---
function copyM(t) { navigator.clipboard.writeText(t); }

function toggleS(m, type) {
    pushHistory();
    const targets = allData.filter(d => d.matricula === m);
    const val = !targets.some(d => d[type]);
    
    targets.forEach(d => { 
        d[type] = val; 
        if(type === 'alerta' && val) { 
            d.eurocop = false; 
        }
        if(type === 'eurocop' && val) { d.alerta = false; d.notificado = false; }
        if(type === 'notificado' && val) { d.alerta = false; d.eurocop = false; }
    });

    if(type === 'alerta' && val) {
        copyM('INMOVILIZAR A DISPOSICIÓN DEL GAD POR REINCIDENCIA EN INFRACCIONES Art 87.5 LSV (CAUCIÓN). Este vehículo es de interés para el negociado de sanciones del Ayuntamiento de Alicante. Se trata de un vehículo reincidente en infracciones de estacionamiento ORA. Realizar incidencia en Eurocop con seguimiento al GAD para su tramitación.');
        alert("🚨 Texto ALERTA copiado.");
    }

    database.ref(DB_REF).set(allData);
}

let target = null;

function openModal(m) {
    target = m; 
    const ex = allData.find(d => d.matricula === m && d.datos_titular && Object.keys(d.datos_titular).length > 0);
    if(ex?.datos_titular) {
        const d = ex.datos_titular;
        document.getElementById('m-nombre').value = d.nombre || '';
        document.getElementById('m-doi').value = d.doi || '';
        document.getElementById('m-dir').value = d.direccion || '';
        document.getElementById('m-loc').value = d.localidad || '';
        document.getElementById('m-fec').value = d.fechaNac || '';
        document.getElementById('m-tel').value = d.telefono || '';
    } else {
        document.querySelectorAll('#notif-modal input').forEach(i => i.value = '');
    }
    document.getElementById('modal-overlay').style.display = 'block';
    document.getElementById('notif-modal').style.display = 'block';
}

function closeModal(id) { 
    document.getElementById('modal-overlay').style.display = 'none'; 
    document.getElementById(id).style.display = 'none'; 
}

function saveAndSend() {
    pushHistory();
    const dt = { 
        nombre: document.getElementById('m-nombre').value, 
        doi: document.getElementById('m-doi').value, 
        direccion: document.getElementById('m-dir').value, 
        localidad: document.getElementById('m-loc').value, 
        fechaNac: document.getElementById('m-fec').value, 
        telefono: document.getElementById('m-tel').value 
    };
    allData.forEach(d => { 
        if(d.matricula === target) { 
            d.notificado = true; 
            d.datos_titular = dt; 
            d.eurocop=false; 
            d.alerta=false; 
        } 
    });
    database.ref(DB_REF).set(allData);

    const items = allData.filter(d => d.matricula === target);
    const ora = items.find(d => d.tipo === 'ORA');
    const rad = items.find(d => d.tipo === 'RADAR');

    let body = "Le informamos de que disponemos de los siguientes datos en relación a este vehículo:\n\n";
    let main = ora || rad || items[0];

    if(ora && rad) {
        body += `Este vehículo tiene denuncias de ORA o de RADAR\n- Última ORA: ${formatDate(ora.fecha)}\n- Última RADAR: ${formatDate(rad.fecha)}\n- Marca: ${main.marca}\n- Modelo: ${main.modelo}`;
    } else if(rad) {
        body += `--- DENUNCIA RADAR ---\n- Matrícula: ${target}\n- Fecha: ${formatDate(rad.fecha)}\n- Marca: ${rad.marca}\n- Modelo: ${rad.modelo}`;
    } else {
        body += `--- DENUNCIA ORA ---\n- Matrícula: ${target}\n- Fecha: ${formatDate(main.fecha)}\n- Marca: ${main.marca}\n- Modelo: ${main.modelo}`;
    }

    const mailLink = `https://outlook.office.com/mail/policia.gad@alicante.es/deeplink/compose?to=${CORREO_SANCIONES}&subject=DATOS GAD - ${target}&body=${encodeURIComponent(
        body + 
        "\n\n--- DATOS PERSONALES ---" +
        "\nNombre: " + dt.nombre + 
        "\nDOI: " + dt.doi + 
        "\nDirección: " + dt.direccion + 
        "\nLocalidad: " + dt.localidad + 
        "\nFecha Nacimiento: " + dt.fechaNac + 
        "\nTeléfono: " + dt.telefono
    )}`;

    window.open(mailLink, '_blank');
    closeModal('notif-modal');
}

function delV(m) { if(confirm("¿Borrar historial de "+m+"?")) { pushHistory(); allData = allData.filter(d => d.matricula !== m); database.ref(DB_REF).set(allData); } }
function delRecord(id) { if(confirm("¿Borrar multa?")) { pushHistory(); allData = allData.filter(d => d.id !== id); database.ref(DB_REF).set(allData); } }
function undo() { if(historyStack.length) { allData = historyStack.pop(); database.ref(DB_REF).set(allData); } }
function pushHistory() { historyStack.push(JSON.parse(JSON.stringify(allData))); if(historyStack.length > 20) historyStack.shift(); }
function setFilter(f) { filter = f; render(); }
function setSort(s) { sort = s; render(); }
function clearDB() { if(prompt("Escribe BORRAR:") === 'BORRAR') database.ref(DB_REF).set([]); }

function saveHelp() { localStorage.setItem('gadHelpText_V2025', document.getElementById('legend-content-area').innerHTML); alert("Guardado"); }

window.onload = () => { 
    setMode('ORA'); 
    document.getElementById('legend-content-area').innerHTML = localStorage.getItem('gadHelpText_V2025') || DEFAULT_HELP_HTML; 
    
    // Asignar eventos drag&drop en el load
    const dz = document.getElementById('drop-zone');
    dz.onclick = () => document.getElementById('file-input').click();
    document.getElementById('file-input').onchange = e => { const f = e.target.files[0]; if(f) handleImport(f); e.target.value = ''; };
    dz.ondragover = (e) => { e.preventDefault(); dz.classList.add('dragover'); };
    dz.ondragleave = () => dz.classList.remove('dragover');
    dz.ondrop = (e) => { e.preventDefault(); dz.classList.remove('dragover'); if(e.dataTransfer.files[0]) handleImport(e.dataTransfer.files[0]); };

    document.getElementById('search-input').oninput = render;
};