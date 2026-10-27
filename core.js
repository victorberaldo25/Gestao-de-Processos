/**
 * core.js - Store + Firestore (Compat SDK) - Gestao de Processos
 * Sem import/export - usa firebase.firestore() global
 */

var STATUS_SCALE = {
    'Em Standby': 0, 'Esbo\u00e7o T\u00e9cnico': 12.5, 'Elabora\u00e7\u00e3o de Processos': 25,
    'Elabora\u00e7\u00e3o de Ferramentas': 37.5, 'Alinhamento Departamental': 50,
    'Ajustes de Processos': 62.5, 'Revis\u00f5es Finais': 75,
    'Aprova\u00e7\u00e3o': 87.5, 'Conclu\u00eddo': 100, 'Reprovado': 0
};

// =========================================================================
// STORE
// =========================================================================
var Store = (function () {
    function Store() {
        this.state = {
            projects: [], users: [], sectors: [], logs: [], statuses: [], inconformidades: [],
            currentFilter: 'Todos', typeFilter: 'Todos', dashboardFilter: 'Todos', dashboardFilterMonth: 'Todos', ganttFilter: 'Todos',
            ganttFilterMonth: 'Todos', ganttFilterStart: '', ganttFilterEnd: '', reprovadosFilter: 'Todos', ready: false
        };
        this.listeners = [];
    }

    Store.prototype.subscribe = function (fn) { this.listeners.push(fn); };
    Store.prototype.notify = function () {
        var s = this.state;
        this.listeners.forEach(function (fn) { fn(s); });
    };

    // Firestore realtime listeners
    Store.prototype.initRealtime = function () {
        var self = this;
        var db = window.db;

        self.unsubscribeAll();

        // Projects listener
        self._unsubProjects = db.collection('projects').onSnapshot(function (snap) {
            self.state.projects = [];
            snap.forEach(function (doc) {
                self.state.projects.push(self._enrich({ id: doc.id, ...doc.data() }));
            });
            self._extractSectors();
            self.state.ready = true;
            self.notify();
        });

        // Users listener
        self._unsubUsers = db.collection('users').onSnapshot(function (snap) {
            self.state.users = [];
            snap.forEach(function (doc) {
                self.state.users.push({ id: doc.id, ...doc.data() });
            });
            // Bootstrap admin se nao existir nenhum user
            if (self.state.users.length === 0) {
                self._bootstrapAdmin();
            }
            self.notify();
        });

        // Statuses listener
        self._unsubStatuses = db.collection('statuses').onSnapshot(function (snap) {
            self.state.statuses = [];
            snap.forEach(function (doc) {
                self.state.statuses.push({ id: doc.id, ...doc.data() });
            });
            self.state.statuses.sort(function (a, b) {
                return a.percentagem - b.percentagem;
            });
            if (self.state.statuses.length === 0) {
                self._bootstrapStatuses();
            } else {
                // Re-enrich projects with new status mappings
                self.state.projects = self.state.projects.map(function (p) {
                    return self._enrich(p);
                });
                self.notify();
            }
        });

        // Logs listener
        self._unsubLogs = db.collection('logs').orderBy('timestamp', 'desc').limit(100).onSnapshot(function (snap) {
            self.state.logs = [];
            snap.forEach(function (doc) {
                self.state.logs.push({ id: doc.id, ...doc.data() });
            });
            self.notify();
        });

        // Inconformidades listener
        self._unsubInconformidades = db.collection('inconformidades').onSnapshot(function (snap) {
            self.state.inconformidades = [];
            snap.forEach(function (doc) {
                self.state.inconformidades.push({ id: doc.id, ...doc.data() });
            });
            // Sort in memory safely by timestamp
            self.state.inconformidades.sort(function (a, b) {
                var tA = a.timestamp || (a.criadoEm ? (a.criadoEm.seconds * 1000) : 0);
                var tB = b.timestamp || (b.criadoEm ? (b.criadoEm.seconds * 1000) : 0);
                return tB - tA;
            });
            self.notify();
        }, function (error) {
            console.warn("Erro ao ler inconformidades:", error);
        });
    };

    Store.prototype.unsubscribeAll = function () {
        if (this._unsubProjects) { this._unsubProjects(); this._unsubProjects = null; }
        if (this._unsubUsers) { this._unsubUsers(); this._unsubUsers = null; }
        if (this._unsubLogs) { this._unsubLogs(); this._unsubLogs = null; }
        if (this._unsubStatuses) { this._unsubStatuses(); this._unsubStatuses = null; }
        if (this._unsubInconformidades) { this._unsubInconformidades(); this._unsubInconformidades = null; }
    };

    Store.prototype._bootstrapAdmin = function () {
        window.db.collection('users').add({
            nome: 'Victor Beraldo', login: 'Victor Beraldo', senha: '0000',
            nivelAcesso: 'Admin', setorBase: 'Geral', setoresVisiveis: ['__ALL__']
        });
    };

    Store.prototype._enrich = function (p) {
        // Normalizar campo com acento
        if (p['dataIn\u00edcio'] && !p.dataInicio) { p.dataInicio = p['dataIn\u00edcio']; }
        p.tipo = p.tipo || 'Procedimento';
        p.percentagemConclusao = this.getStatusPercentage(p.statusAtual);
        if (p.dataFimPrevista && p.percentagemConclusao < 100) {
            var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            var fim = new Date(p.dataFimPrevista + 'T00:00:00');
            p.diasParaConclusaoPrevista = Math.ceil((fim - hoje) / 864e5);
        } else {
            p.diasParaConclusaoPrevista = null;
        }
        return p;
    };

    Store.prototype._extractSectors = function () {
        var s = new Set(this.state.projects.map(function (p) { return p.setor; }).filter(Boolean));
        this.state.sectors = Array.from(s).sort();
    };

    // Private log helper
    Store.prototype._logAction = function (actionText, details) {
        var db = window.db;
        var session = window.AuthManager ? window.AuthManager.getSession() : null;
        var userNome = session ? session.nome : 'Sistema';
        var userLogin = session ? session.login : 'sistema';
        
        return db.collection('logs').add({
            usuarioNome: userNome,
            usuarioLogin: userLogin,
            acao: actionText,
            detalhes: details || '',
            timestamp: new Date().toISOString()
        });
    };

    // Save / Update Project
    Store.prototype.saveProject = function (data, obs) {
        var now = new Date().toISOString();
        var db = window.db;

        if (data.id) {
            var old = this.state.projects.find(function (p) { return p.id === data.id; });
            var hist = (old && old.historicoAtualizacoes) ? old.historicoAtualizacoes.slice() : [];
            if ((old && old.statusAtual !== data.statusAtual) || obs) {
                hist.push({
                    dataAlteracao: now,
                    statusAnterior: old ? old.statusAtual : 'N/A',
                    statusNovo: data.statusAtual,
                    observacao: obs || 'Atualizado.'
                });
            }
            var id = data.id;
            var clean = Object.assign({}, data);
            delete clean.id; delete clean.percentagemConclusao; delete clean.diasParaConclusaoPrevista;
            clean.historicoAtualizacoes = hist;
            if (clean.dataInicio) {
                clean['dataIn\u00edcio'] = clean.dataInicio;
            }
            this._logAction('Atualizou o projeto "' + data.projeto + '"', 'Status: ' + data.statusAtual + (obs ? ' | Obs: ' + obs : ''));
            return db.collection('projects').doc(id).set(clean);
        } else {
            var clean = Object.assign({}, data);
            delete clean.id; delete clean.percentagemConclusao; delete clean.diasParaConclusaoPrevista;
            clean.historicoAtualizacoes = [{ dataAlteracao: now, statusAnterior: 'N/A', statusNovo: data.statusAtual, observacao: obs || 'Projeto criado.' }];
            if (clean.dataInicio) {
                clean['dataIn\u00edcio'] = clean.dataInicio;
            }
            this._logAction('Criou o projeto "' + data.projeto + '"', 'Status: ' + data.statusAtual);
            return db.collection('projects').add(clean);
        }
    };

    Store.prototype.saveRevision = function (projectId, rev) {
        var db = window.db;
        var p = this.getProjectById(projectId);
        if (!p) return Promise.reject(new Error("Projeto não encontrado."));
        
        var session = window.AuthManager ? window.AuthManager.getSession() : null;
        var userNome = session ? session.nome : 'Sistema';
        
        var revs = p.revisoes ? p.revisoes.slice() : [];
        revs.push({
            dataRevisao: rev.dataRevisao,
            comentario: rev.comentario,
            usuarioNome: userNome,
            timestamp: new Date().toISOString()
        });
        
        this._logAction('Registrou revisão no projeto "' + p.projeto + '"', 'Data: ' + rev.dataRevisao + ' | Obs: ' + rev.comentario);
        return db.collection('projects').doc(projectId).update({ revisoes: revs });
    };

    Store.prototype.deleteProject = function (id) {
        var db = window.db;
        var p = this.getProjectById(id);
        if (p) {
            this._logAction('Excluiu o projeto "' + p.projeto + '"', 'Setor: ' + p.setor);
            return db.collection('projects').doc(id).delete();
        }
    };

    Store.prototype.getProjectById = function (id) {
        return this.state.projects.find(function (p) { return p.id === id; });
    };

    // Sectors
    Store.prototype.addSector = function (name) {
        if (!name || this.state.sectors.includes(name)) return;
        this._logAction('Adicionou o setor "' + name + '"');
        return window.db.collection('projects').add({
            projeto: '__SECTOR_PLACEHOLDER__', setor: name, statusAtual: 'Em Standby',
            dataInicio: '', dataFimPrevista: '', historicoAtualizacoes: []
        });
    };

    Store.prototype.updateSector = function (oldName, newName) {
        if (!oldName || !newName || oldName === newName) return;
        var db = window.db;
        var batch = db.batch();

        var projectsToUpdate = this.state.projects.filter(function (p) {
            return p.setor === oldName;
        });

        projectsToUpdate.forEach(function (p) {
            var ref = db.collection('projects').doc(p.id);
            batch.update(ref, { setor: newName });
        });

        this.state.users.forEach(function (u) {
            var needsUpdate = false;
            var updateObj = {};

            if (u.setorBase === oldName) {
                updateObj.setorBase = newName;
                needsUpdate = true;
            }

            if (u.setoresVisiveis && u.setoresVisiveis.indexOf(oldName) !== -1) {
                var newVisiveis = u.setoresVisiveis.map(function (s) {
                    return s === oldName ? newName : s;
                });
                updateObj.setoresVisiveis = newVisiveis;
                needsUpdate = true;
            }

            if (needsUpdate) {
                var ref = db.collection('users').doc(u.id);
                batch.update(ref, updateObj);
            }
        });

        this._logAction('Editou o setor "' + oldName + '" para "' + newName + '"');
        return batch.commit();
    };

    // Users
    Store.prototype.saveUser = function (u) {
        if (u.id) {
            var id = u.id;
            var data = Object.assign({}, u); delete data.id;
            this._logAction('Editou o utilizador "' + u.nome + '"', 'Login: ' + u.login + ' | Nível: ' + u.nivelAcesso);
            return window.db.collection('users').doc(id).set(data);
        }
        var data = Object.assign({}, u); delete data.id;
        this._logAction('Criou o utilizador "' + u.nome + '"', 'Login: ' + u.login + ' | Nível: ' + u.nivelAcesso);
        return window.db.collection('users').add(data);
    };

    Store.prototype.removeUser = function (id) {
        var u = this.state.users.find(function (x) { return x.id === id; });
        if (u) {
            this._logAction('Excluiu o utilizador "' + u.nome + '"', 'Login: ' + u.login);
        }
        return window.db.collection('users').doc(id).delete();
    };

    Store.prototype.saveInconformidade = function (data) {
        var now = new Date().toISOString();
        var db = window.db;
        var session = window.AuthManager ? window.AuthManager.getSession() : null;
        var userNome = session ? session.nome : 'Sistema';
        var userLogin = session ? session.login : 'sistema';
        
        if (data.id) {
            var old = this.state.inconformidades.find(function (x) { return x.id === data.id; });
            var hist = (old && old.historico) ? old.historico.slice() : [];
            if ((old && old.status !== data.status) || data.novaObservacao) {
                hist.push({
                    dataAlteracao: now,
                    usuarioNome: userNome,
                    statusAnterior: old ? old.status : 'N/A',
                    statusNovo: data.status,
                    observacao: data.novaObservacao || 'Atualizado.'
                });
            }
            var id = data.id;
            var clean = Object.assign({}, data);
            delete clean.id; delete clean.novaObservacao;
            clean.historico = hist;
            this._logAction('Atualizou a inconformidade "' + data.descricao.substring(0, 30) + '..."', 'Status: ' + data.status);
            return db.collection('inconformidades').doc(id).set(clean);
        } else {
            var clean = Object.assign({}, data);
            delete clean.id; delete clean.novaObservacao;
            clean.usuarioNome = userNome;
            clean.usuarioLogin = userLogin;
            clean.dataCriacao = now;
            clean.timestamp = Date.now();
            clean.historico = [{
                dataAlteracao: now,
                usuarioNome: userNome,
                statusAnterior: 'N/A',
                statusNovo: data.status,
                observacao: 'Não conformidade registrada.'
            }];
            this._logAction('Criou a inconformidade "' + data.descricao.substring(0, 30) + '..."', 'Status: ' + data.status);
            return db.collection('inconformidades').add(clean);
        }
    };

    Store.prototype.deleteInconformidade = function (id) {
        var db = window.db;
        var inc = this.state.inconformidades.find(function (x) { return x.id === id; });
        if (inc) {
            this._logAction('Excluiu a não conformidade "' + inc.descricao.substring(0, 30) + '..."');
            return db.collection('inconformidades').doc(id).delete();
        }
        return Promise.resolve();
    };

    Store.prototype.setFilter = function (s) { this.state.currentFilter = s; this.notify(); };
    Store.prototype.setTypeFilter = function (t) { this.state.typeFilter = t; this.notify(); };
    Store.prototype.setDashboardFilter = function (s) { this.state.dashboardFilter = s; this.notify(); };
    Store.prototype.setDashboardFilterMonth = function (s) { this.state.dashboardFilterMonth = s; this.notify(); };
    Store.prototype.setGanttFilter = function (s) { this.state.ganttFilter = s; this.notify(); };
    Store.prototype.setGanttDateFilters = function (month, start, end) {
        this.state.ganttFilterMonth = month || 'Todos';
        this.state.ganttFilterStart = start || '';
        this.state.ganttFilterEnd = end || '';
        this.notify();
    };
    Store.prototype.setReprovadosFilter = function (s) { this.state.reprovadosFilter = s; this.notify(); };

    Store.prototype.getStatusPercentage = function (statusName) {
        var found = this.state.statuses.find(function (s) {
            return s.nome === statusName;
        });
        if (found) return found.percentagem;
        var fallback = {
            'Em Standby': 0, 'Esbo\u00e7o T\u00e9cnico': 12.5, 'Elabora\u00e7\u00e3o de Processos': 25,
            'Elabora\u00e7\u00e3o de Ferramentas': 37.5, 'Alinhamento Departamental': 50,
            'Ajustes de Processos': 62.5, 'Revis\u00f5es Finais': 75,
            'Aprova\u00e7\u00e3o': 87.5, 'Conclu\u00eddo': 100, 'Reprovado': 0
        };
        return fallback[statusName] !== undefined ? fallback[statusName] : 0;
    };

    Store.prototype._bootstrapStatuses = function () {
        var db = window.db;
        var defaults = [
            { nome: 'Em Standby', percentagem: 0 },
            { nome: 'Esbo\u00e7o T\u00e9cnico', percentagem: 12.5 },
            { nome: 'Elabora\u00e7\u00e3o de Processos', percentagem: 25 },
            { nome: 'Elabora\u00e7\u00e3o de Ferramentas', percentagem: 37.5 },
            { nome: 'Alinhamento Departamental', percentagem: 50 },
            { nome: 'Ajustes de Processos', percentagem: 62.5 },
            { nome: 'Revis\u00f5es Finais', percentagem: 75 },
            { nome: 'Aprova\u00e7\u00e3o', percentagem: 87.5 },
            { nome: 'Conclu\u00eddo', percentagem: 100 },
            { nome: 'Reprovado', percentagem: 0 }
        ];
        var batch = db.batch();
        defaults.forEach(function (s) {
            var ref = db.collection('statuses').doc();
            batch.set(ref, s);
        });
        return batch.commit();
    };

    Store.prototype.saveStatus = function (data) {
        var db = window.db;
        if (data.id) {
            var id = data.id;
            var clean = Object.assign({}, data);
            delete clean.id;
            this._logAction('Atualizou o status "' + data.nome + '"', 'Percentagem: ' + data.percentagem + '%');
            return db.collection('statuses').doc(id).set(clean);
        } else {
            var clean = Object.assign({}, data);
            delete clean.id;
            this._logAction('Criou o status "' + data.nome + '"', 'Percentagem: ' + data.percentagem + '%');
            return db.collection('statuses').add(clean);
        }
    };

    Store.prototype.deleteStatus = function (id) {
        var db = window.db;
        var s = this.state.statuses.find(function (x) { return x.id === id; });
        if (s) {
            this._logAction('Excluiu o status "' + s.nome + '"', 'Percentagem: ' + s.percentagem + '%');
            return db.collection('statuses').doc(id).delete();
        }
    };

    return Store;
})();

var appStore = new Store();
window.appStore = appStore;

// =========================================================================
// AUTH
// =========================================================================
var AuthManager = {
    SESSION_KEY: 'gp_session',

    login: function (login, senha) {
        var user = appStore.state.users.find(function (u) {
            return u.login === login && u.senha === senha;
        });
        if (!user) return null;
        sessionStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
        return user;
    },

    logout: function () {
        sessionStorage.removeItem(this.SESSION_KEY);
    },

    getSession: function () {
        try { return JSON.parse(sessionStorage.getItem(this.SESSION_KEY)); } catch (e) { return null; }
    },

    isAdmin: function () {
        var s = this.getSession();
        return s && s.nivelAcesso === 'Admin';
    },

    canCreateOrEdit: function () {
        var s = this.getSession();
        if (!s) return false;
        var r = s.nivelAcesso;
        return r === 'Admin' || r === 'Editor' || r === 'Usuário' || r === 'Gestor' || r === 'Criador';
    },

    canDelete: function () {
        var s = this.getSession();
        return s && s.nivelAcesso === 'Admin';
    },

    filterByPermission: function (projects) {
        var s = this.getSession();
        if (!s) return [];
        var real = projects.filter(function (p) { return p.projeto !== '__SECTOR_PLACEHOLDER__'; });
        if (s.setoresVisiveis && s.setoresVisiveis.indexOf('__ALL__') !== -1) return real;
        return real.filter(function (p) {
            var sector = p.setor || p.setor_registrou;
            return s.setoresVisiveis && s.setoresVisiveis.indexOf(sector) !== -1;
        });
    },

    visibleSectors: function () {
        var s = this.getSession();
        if (!s) return [];
        if (s.setoresVisiveis && s.setoresVisiveis.indexOf('__ALL__') !== -1) return appStore.state.sectors;
        var list = appStore.state.sectors.filter(function (sec) {
            return (s.setoresVisiveis && s.setoresVisiveis.indexOf(sec) !== -1) || sec === s.setorBase;
        });
        if (s.setorBase && list.indexOf(s.setorBase) === -1 && appStore.state.sectors.indexOf(s.setorBase) !== -1) {
            list.unshift(s.setorBase);
        }
        return list;
    }
};
window.AuthManager = AuthManager;