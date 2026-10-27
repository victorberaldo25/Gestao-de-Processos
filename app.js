/**
 * app.js - SPA Core Logic (MVC & State Management)
 * Arquitetura Vanilla JS focado em modularização e padrão Observer.
 */

// =========================================================================
// 1. STATE MANAGER (Store) - The Single Source of Truth
// =========================================================================
class Store {
    constructor() {
        this.state = {
            projects: [],
            currentFilter: 'Todos',
            dbHandle: null // Referência ao arquivo local (File System API)
        };
        // Array de listeners para reatividade (Observer Pattern)
        this.listeners = [];
    }

    // Subscrever funções que serão chamadas ao mutar o state
    subscribe(listener) {
        this.listeners.push(listener);
    }

    // Notificar todos os inscritos
    notify() {
        this.listeners.forEach(listener => listener(this.state));
    }

    // Métodos para mutação de estado (Reducers-like)
    setProjects(data) {
        this.state.projects = data.map(this._calculateDynamicFields);
        this.notify();
    }

    setDbHandle(handle) {
        this.state.dbHandle = handle;
        this.notify();
    }

    setFilter(sector) {
        this.state.currentFilter = sector;
        this.notify();
    }

    addOrUpdateProject(projectData, observation = '') {
        const index = this.state.projects.findIndex(p => p.id === projectData.id);
        const now = new Date().toISOString();
        
        if (index > -1) {
            // Update
            const oldProject = this.state.projects[index];
            const statusChanged = oldProject.statusAtual !== projectData.statusAtual;
            
            let updatedProject = { ...oldProject, ...projectData };
            
            // Lógica Imutável de Histórico OBRIGATÓRIA
            if (statusChanged || observation.trim() !== '') {
                updatedProject.historicoAtualizacoes.push({
                    dataAlteracao: now,
                    statusAnterior: oldProject.statusAtual,
                    statusNovo: projectData.statusAtual,
                    observacao: observation || 'Status atualizado pela plataforma.'
                });
            }
            
            this.state.projects[index] = this._calculateDynamicFields(updatedProject);
        } else {
            // Create
            projectData.historicoAtualizacoes = [{
                dataAlteracao: now,
                statusAnterior: 'N/A',
                statusNovo: projectData.statusAtual,
                observacao: observation || 'Projeto criado e registado.'
            }];
            this.state.projects.push(this._calculateDynamicFields(projectData));
        }
        
        this.notify();
        // Dispara autosave
        FileSystemService.saveDatabase(this.state.projects, this.state.dbHandle);
    }

    getProjectById(id) {
        return this.state.projects.find(p => p.id === id);
    }

    // Utilitário interno para cálculos dependentes do tempo (Dynamic)
    _calculateDynamicFields(project) {
        // Mapeamento exigido para a Badge/Progresso
        const statusScale = {
            'Em Standby': 0,
            'Esboço Técnico': 12.5,
            'Elaboração de Processos': 25,
            'Elaboração de Ferramentas': 37.5,
            'Alinhamento Departamental': 50,
            'Ajustes de Processos': 62.5,
            'Revisões Finais': 75,
            'Aprovação': 87.5,
            'Concluído': 100
        };

        if(project.statusAtual in statusScale) {
            project.percentagemConclusao = statusScale[project.statusAtual];
        }

        // Dias para conclusão prevista (Calculado sempre que o dado passa pelo Store)
        if (project.dataFimPrevista && project.statusAtual !== 'Concluído') {
            // Usando dias corridos (conforme fallback comum ou padrão mais simples para manipulação JS de data)
            const d1 = new Date(); // Hoje
            d1.setHours(0,0,0,0);
            
            // Evitar problemas de fuso no Date parsing nativo anexando a timezone (T00:00:00)
            const previsao = project.dataFimPrevista.includes('T') ? project.dataFimPrevista : project.dataFimPrevista + 'T00:00:00';
            const d2 = new Date(previsao);
            
            const diffTime = d2 - d1;
            project.diasParaConclusaoPrevista = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        } else {
            project.diasParaConclusaoPrevista = null;
        }

        return project;
    }
}

// Instância Global do State
const appStore = new Store();

// =========================================================================
// 1.5 INDEXED DB HELPER (Para lembrar o arquivo selecionado)
// =========================================================================
const IDB_NAME = 'ProcessFlowDB';
const STORE_NAME = 'FileHandles';

function openIDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(IDB_NAME, 1);
        req.onupgradeneeded = (e) => e.target.result.createObjectStore(STORE_NAME);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

async function saveHandleToIDB(handle) {
    const db = await openIDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, 'dbHandle');
}

async function getHandleFromIDB() {
    const db = await openIDB();
    return new Promise((resolve) => {
        const req = db.transaction(STORE_NAME).objectStore(STORE_NAME).get('dbHandle');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(null);
    });
}

// =========================================================================
// 2. IO MODULE - File System Access API & Fallback
// =========================================================================
class FileSystemService {
    static isSupported() {
        return 'showOpenFilePicker' in window;
    }

    // Tentar carregar automaticamente do IndexedDB ao abrir a página
    static async tryAutoRefresh() {
        if (!this.isSupported()) return false;
        
        const handle = await getHandleFromIDB();
        if (!handle) return false;

        try {
            // Verifica se precisamos pedir permissão novamente
            const options = { mode: 'readwrite' };
            let perm = await handle.queryPermission(options);
            
            // Requer interação do usuário se a permissão foi perdida (ex: fecha e abre o browser)
            if (perm !== 'granted') {
                return false; // Neste caso, não dá pra carregar agressivamente sem click. O usuário terá que clicar no botão novo "Restaurar"
            }

            await this._loadFileFromHandle(handle);
            return true;
        } catch (e) {
            console.log("Cached handle error or expired:", e);
            return false;
        }
    }

    // Permissão ativada via clique de botão (Restaurar)
    static async restoreFromMemory() {
        const handle = await getHandleFromIDB();
        if(!handle) return false;

        const perm = await handle.requestPermission({ mode: 'readwrite' });
        if(perm === 'granted') {
            await this._loadFileFromHandle(handle);
            return true;
        }
        return false;
    }

    static async openDatabase() {
        try {
            if (this.isSupported()) {
                const [fileHandle] = await window.showOpenFilePicker({
                    types: [{ description: 'JSON Database', accept: { 'application/json': ['.json'] } }],
                    multiple: false
                });
                
                await saveHandleToIDB(fileHandle);
                await this._loadFileFromHandle(fileHandle);
                return true;
            } else {
                // Fallback clásico input=file
                document.getElementById('fallback-upload').click();
            }
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('Falha ao abrir DB:', err);
                alert('Erro ao ler a Base de Dados local.');
            }
        }
    }

    static async _loadFileFromHandle(fileHandle) {
        const file = await fileHandle.getFile();
        const text = await file.text();
        const data = JSON.parse(text);
        appStore.setDbHandle(fileHandle);
        appStore.setProjects(data);
    }

    static async saveDatabase(data, dbHandle) {
        const jsonStr = JSON.stringify(data, null, 2);
        
        try {
            if (this.isSupported() && dbHandle) {
                // Modo Moderno: Permissão de Escrita Transparente
                const writable = await dbHandle.createWritable();
                await writable.write(jsonStr);
                await writable.close();
                console.log('Autosave concluído na DB nativa.');
            } else {
                // Fallback clássico: Força download (Blob)
                const blob = new Blob([jsonStr], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `processflow_db_${new Date().getTime()}.json`;
                a.click();
                URL.revokeObjectURL(url);
            }
        } catch (err) {
            console.error('Falha ao salvar DB:', err);
        }
    }
    
    // Tratador de fallback originado no DOM
    static handleFallbackUpload(event) {
        const file = event.target.files[0];
        if(!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target.result);
                appStore.setDbHandle('fallback-mode'); // Fake flag
                appStore.setProjects(data);
            } catch (err) {
                alert('O arquivo selecionado não é um JSON válido.');
            }
        };
        reader.readAsText(file);
    }
}

// =========================================================================
// 3. UI CONTROLLERS (View Managers)
// =========================================================================

class DashboardView {
    constructor() {
        appStore.subscribe(this.render.bind(this));
        
        // Elementos DOM
        this.kpiTotal = document.getElementById('kpi-total');
        this.kpiConc = document.getElementById('kpi-concluidos');
        this.kpiAndam = document.getElementById('kpi-andamento');
        this.kpiAtraso = document.getElementById('kpi-atrasados');
        
        this.barsContainer = document.getElementById('sector-bars-container');
        this.criticalList = document.getElementById('critical-projects-list');
    }

    render(state) {
        const p = state.projects;
        if(p.length === 0) return;

        // KPI calculations
        this.kpiTotal.textContent = p.length;
        this.kpiConc.textContent = p.filter(x => x.statusAtual === 'Concluído').length;
        this.kpiAndam.textContent = p.filter(x => x.statusAtual !== 'Concluído' && x.statusAtual !== 'Em Standby').length;
        
        const atrasados = p.filter(x => x.diasParaConclusaoPrevista !== null && x.diasParaConclusaoPrevista < 0);
        this.kpiAtraso.textContent = atrasados.length;

        // Progressão Setorial
        this._renderSectorBars(p);
        
        // Lista Crítica
        this._renderCriticalList(atrasados);
    }

    _renderSectorBars(projects) {
        const setores = {};
        // Calcula média de progresso por setor
        projects.forEach(p => {
            if(!setores[p.setor]) setores[p.setor] = { total: 0, sum: 0 };
            setores[p.setor].total += 1;
            setores[p.setor].sum += p.percentagemConclusao || 0;
        });

        this.barsContainer.innerHTML = Object.entries(setores).map(([name, data]) => {
            const avg = (data.sum / data.total).toFixed(1);
            return `
                <div class="sector-bar">
                    <div class="sb-header">
                        <span>${name}</span>
                        <span>${avg}%</span>
                    </div>
                    <div class="sb-track">
                        <div class="sb-fill" style="width: ${avg}%"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    _renderCriticalList(críticos) {
        if(críticos.length === 0){
            this.criticalList.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem">Nenhum projeto crítico no momento.</span>';
            return;
        }

        // Ordena do menor pro maior (Atraso mais crítico primeiro)
        críticos.sort((a,b) => a.diasParaConclusaoPrevista - b.diasParaConclusaoPrevista);
        
        this.criticalList.innerHTML = críticos.slice(0, 5).map(p => `
            <div class="critical-item">
                <div style="flex:1">
                    <div style="font-weight:600">${p.projeto} <span class="badge badge-default">${p.setor}</span></div>
                </div>
                <div><strong><i class="fa-solid fa-triangle-exclamation"></i> ${p.diasParaConclusaoPrevista} dias</strong></div>
            </div>
        `).join('');
    }
}


class KanbanView {
    constructor() {
        appStore.subscribe(this.render.bind(this));
        // Registra singleton para os modais
        this.modalCtrl = new ModalController();

        this.container = document.getElementById('kanban-container');
        this.filtersContainer = document.getElementById('sector-filters');
    }

    render(state) {
        this._renderFilters(state);
        
        const filtered = state.currentFilter === 'Todos' ? 
            state.projects : 
            state.projects.filter(p => p.setor === state.currentFilter);

        this.container.innerHTML = filtered.map(p => this._generateCardHTML(p)).join('');

        // Attacha eventos dos cards gerados
        this.container.querySelectorAll('.kanban-card').forEach(card => {
            card.addEventListener('click', () => {
                this.modalCtrl.openOffcanvas(card.dataset.id);
            });
        });
    }

    _renderFilters(state) {
        const uniqueSectors = ['Todos', ...new Set(state.projects.map(p => p.setor))];
        
        // Evita re-render overhead no menu se for igual
        if(this.filtersContainer.dataset.hashes === uniqueSectors.join()) return;
        
        this.filtersContainer.dataset.hashes = uniqueSectors.join();
        this.filtersContainer.innerHTML = uniqueSectors.map(s => `
            <button class="tab ${state.currentFilter === s ? 'active' : ''}" data-sector="${s}">
                ${s}
            </button>
        `).join('');

        // Eventos filtros
        this.filtersContainer.querySelectorAll('.tab').forEach(btn => {
            btn.addEventListener('click', (e) => appStore.setFilter(e.target.dataset.sector));
        });
    }

    _generateCardHTML(p) {
        const isLate = p.diasParaConclusaoPrevista !== null && p.diasParaConclusaoPrevista < 0;
        
        let badgeClass = 'badge-default';
        if(p.statusAtual === 'Concluído') badgeClass = 'badge-success';
        else if (isLate) badgeClass = 'badge-warning';
        else if (p.percentagemConclusao > 0) badgeClass = 'badge-progress';
        
        const formatData = (d) => {
            if(!d) return '--';
            const [y,m,day] = d.split('-');
            return `${day}/${m}/${y}`;
        };

        return `
            <div class="kanban-card ${isLate ? 'atrasado' : ''}" data-id="${p.id}">
                <div class="kc-sector">${p.setor}</div>
                <div class="kc-title">${p.projeto}</div>
                
                <div class="kc-progress-lay">
                    <div class="kc-progress-text">
                        <span><span class="badge ${badgeClass}">${p.statusAtual}</span></span>
                        <span>${p.percentagemConclusao}%</span>
                    </div>
                    <div class="kc-track">
                        <div class="kc-fill" style="width: ${p.percentagemConclusao}%; background-color: ${p.percentagemConclusao===100?'var(--color-success)':''};"></div>
                    </div>
                </div>
                
                <div class="kc-footer">
                    <div class="kc-days ${isLate ? 'danger' : ''}">
                        <i class="fa-regular fa-clock"></i> 
                        ${p.diasParaConclusaoPrevista === null ? 'Sem previsão' : 
                         (isLate ? `${Math.abs(p.diasParaConclusaoPrevista)} dias atrasado` : `${p.diasParaConclusaoPrevista} dias restantes`)}
                    </div>
                    <button class="btn btn-sm btn-outline btn-edit" title="Editar Projeto" onclick="event.stopPropagation(); window.modalCtrlSingleton.openEditor('${p.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                </div>
            </div>
        `;
    }
}


class ModalController {
    constructor() {
        window.modalCtrlSingleton = this; // Hacks for inline onclicks in generated HTML

        // Elementos Editor
        this.dialog = document.getElementById('process-editor-dialog');
        this.form = document.getElementById('process-form');
        this.overlay = document.getElementById('global-modal-overlay');

        // Elementos Offcanvas Timeline
        this.offcanvas = document.getElementById('offcanvas-details');
        
        this._bindEvents();
    }

    _bindEvents() {
        // Form Logic
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.saveForm();
        });

        // Overlay fecha dialog
        document.querySelectorAll('[data-close-dialog]').forEach(btn => {
            btn.addEventListener('click', () => this.closeEditor());
        });

        // Fechar Offcanvas
        document.getElementById('btn-close-offcanvas').addEventListener('click', () => this.closeOffcanvas());
        this.overlay.addEventListener('click', () => {
            this.closeEditor();
            this.closeOffcanvas();
        });
    }

    openEditor(projectId = null) {
        this.form.reset();
        const obsField = document.getElementById('update-observation-wrap');

        if (projectId) {
            document.getElementById('dialog-title').innerText = 'Atualizar Projeto';
            const proj = appStore.getProjectById(projectId);
            
            document.getElementById('field-id').value = proj.id;
            document.getElementById('field-projeto').value = proj.projeto;
            document.getElementById('field-setor').value = proj.setor;
            document.getElementById('field-status').value = proj.statusAtual;
            document.getElementById('field-data-inicio').value = proj.dataInício;
            document.getElementById('field-data-fim-prevista').value = proj.dataFimPrevista;
            document.getElementById('field-data-fim-real').value = proj.dataFimReal || '';
            
            obsField.style.display = 'block';
        } else {
            document.getElementById('dialog-title').innerText = 'Novo Projeto';
            document.getElementById('field-id').value = '';
            obsField.style.display = 'none'; // Não forçar observação no first hit
            
            // Generate simple ID
            document.getElementById('field-id').value = 'PRJ-' + Math.floor(Math.random()*9000 + 1000);
        }

        this.overlay.classList.add('show');
        this.dialog.show();
    }

    closeEditor() {
        this.dialog.close();
        this.overlay.classList.remove('show');
    }

    saveForm() {
        if (!this.form.checkValidity()) return;

        const data = {
            id: document.getElementById('field-id').value,
            projeto: document.getElementById('field-projeto').value,
            setor: document.getElementById('field-setor').value,
            statusAtual: document.getElementById('field-status').value,
            dataInício: document.getElementById('field-data-inicio').value,
            dataFimPrevista: document.getElementById('field-data-fim-prevista').value,
            dataFimReal: document.getElementById('field-data-fim-real').value || null
        };

        const obs = document.getElementById('field-observacao').value;

        appStore.addOrUpdateProject(data, obs);
        this.closeEditor();
    }

    openOffcanvas(projectId) {
        const proj = appStore.getProjectById(projectId);
        if(!proj) return;

        document.getElementById('detail-sector').textContent = proj.setor;
        document.getElementById('detail-title').textContent = proj.projeto;
        document.getElementById('detail-dias').textContent = proj.diasParaConclusaoPrevista ?? 'N/A';
        document.getElementById('detail-percent').textContent = proj.percentagemConclusao + '%';

        // Render Timeline Automático
        const timelineWrap = document.getElementById('detail-timeline');
        const reversedHistory = [...proj.historicoAtualizacoes].reverse();

        const formatDate = (isoStr) => {
            const d = new Date(isoStr);
            return d.toLocaleString('pt-BR', { dateStyle:'short', timeStyle:'short' });
        };

        timelineWrap.innerHTML = reversedHistory.map(h => `
            <div class="timeline-item">
                <div class="tl-date">${formatDate(h.dataAlteracao)}</div>
                <div class="tl-content">
                    <h4>${h.statusNovo}</h4>
                    <p style="font-size:0.65rem; color:var(--text-muted); margin-bottom: 0.2rem">Anterior: ${h.statusAnterior}</p>
                    <p>${h.observacao}</p>
                </div>
            </div>
        `).join('');

        this.overlay.classList.add('show');
        this.offcanvas.classList.add('show');
    }

    closeOffcanvas() {
        this.offcanvas.classList.remove('show');
        this.overlay.classList.remove('show');
    }
}


// =========================================================================
// 4. MAIN APP INITIALIZER
// =========================================================================
document.addEventListener('DOMContentLoaded', () => {
    
    // Instanciar Views (Elas se inscrevem automaticamente no Store)
    new DashboardView();
    new KanbanView();

    // Lógica Global de Navegação nas Views da Sidebar
    const navLinks = document.querySelectorAll('.nav-link');
    const sections = document.querySelectorAll('.view-section');

    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetViewId = 'view-' + link.dataset.view;

            navLinks.forEach(n => n.classList.remove('active'));
            link.classList.add('active');

            sections.forEach(s => s.classList.remove('active'));
            document.getElementById(targetViewId).classList.add('active');
        });
    });

    // Eventos e UI bindings baseados no estado (Header)
    appStore.subscribe((state) => {
        const badge = document.getElementById('db-status-badge');
        const newBtn = document.getElementById('btn-new-process');
        
        if (state.dbHandle) {
            badge.classList.add('connected');
            badge.innerHTML = `<i class="fa-solid fa-server"></i> <span>Sincronizado Localmente</span>`;
            newBtn.disabled = false;
        } else {
            badge.classList.remove('connected');
            newBtn.disabled = true;
        }

        // Força datalist pro formulário (Auto-complete de setores)
        const dl = document.getElementById('setores-datalist');
        const sectors = [...new Set(state.projects.map(p => p.setor))];
        dl.innerHTML = sectors.map(s => `<option value="${s}">`).join('');
    });

    // DB Bindings I/O
    const btnOpen = document.getElementById('btn-open-db');
    btnOpen.addEventListener('click', async () => {
        // Tenta restaurar do IDB se a permissão não foi concedida mas existe um cached handle.
        // Se falhar ou não existir, abre o picker normalmente.
        const restored = await FileSystemService.restoreFromMemory();
        if (!restored) {
            FileSystemService.openDatabase();
        }
    });

    document.getElementById('fallback-upload').addEventListener('change', FileSystemService.handleFallbackUpload);

    document.getElementById('btn-new-process').addEventListener('click', () => {
        window.modalCtrlSingleton.openEditor();
    });

    // STARTUP FLOW: Verifica se tínhamos um arquivo em cache (para acelerar recarregos)
    FileSystemService.tryAutoRefresh().then(loaded => {
        if(loaded) {
            console.log("Sessão recarregada silenciosamente por permissões concedidas!");
        } else {
            // Tenta mudar o texto/icone do botão open para refletir que há algo no histórico
            getHandleFromIDB().then(handle => {
                if(handle) {
                    btnOpen.innerHTML = `<i class="fa-solid fa-clock-rotate-left"></i> Restaurar Último DB`;
                    btnOpen.classList.add('btn-outline');
                }
            });
        }
    });

});
