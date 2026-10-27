/**
 * ui.js - Interface completa (Gestao de Processos)
 * Sem import/export - usa window.appStore e window.AuthManager
 */

// =========================================================================
// DASHBOARD
// =========================================================================
function DashboardView() {
    appStore.subscribe(this.render.bind(this));
    this.selectedYear = new Date().getFullYear();
    this.popoverOpen = false;
    this._initEvents();
}
DashboardView.prototype.render = function (state) {
    var all = AuthManager.filterByPermission(state.projects);
    var vis = AuthManager.visibleSectors();
    this._tabs(state.dashboardFilter, vis);
    
    var allP = state.dashboardFilter === 'Todos' ? all : all.filter(function (x) { return x.setor === state.dashboardFilter; });
    
    this._populateYears(all);
    this._updatePickerState(state.dashboardFilterMonth);
    
    // Calculate goal statistics and filter indicators by month
    var previstos = 0;
    var realizados = 0;
    var listMeta = [];
    var listCompleted = [];
    var listAndamento = [];
    var listAtrasados = [];
    var listReprovados = [];
    
    var p_focused = allP;
    
    if (state.dashboardFilterMonth && state.dashboardFilterMonth !== 'Todos') {
        var targetMonth = state.dashboardFilterMonth; // YYYY-MM
        
        // The user wants to analyze ONLY projects planned to finish in the selected month
        p_focused = allP.filter(function (x) {
            return x.dataFimPrevista && x.dataFimPrevista.substring(0, 7) === targetMonth;
        });
        
        p_focused.forEach(function (x) {
            if (x.statusAtual === 'Reprovado') {
                listReprovados.push(x);
            } else {
                listMeta.push(x);
                if (x.percentagemConclusao === 100) {
                    realizados++;
                    listCompleted.push(x);
                } else {
                    var late = x.diasParaConclusaoPrevista !== null && x.diasParaConclusaoPrevista < 0;
                    if (late) {
                        listAtrasados.push(x);
                    } else {
                        listAndamento.push(x);
                    }
                }
            }
        });
        
        previstos = listMeta.length;
        var total = p_focused.length;
        var completed = realizados;
        var andamento = listAndamento.length;
        var atrasados = listAtrasados.length;
        var reprovados = listReprovados.length;
    } else {
        // 'Todos' is selected - show all projects and regular categorization
        allP.forEach(function (x) {
            if (x.statusAtual === 'Reprovado') {
                listReprovados.push(x);
            } else {
                if (x.dataFimPrevista) {
                    listMeta.push(x);
                }
                if (x.percentagemConclusao === 100) {
                    realizados++;
                    listCompleted.push(x);
                } else {
                    var late = x.diasParaConclusaoPrevista !== null && x.diasParaConclusaoPrevista < 0;
                    if (late) {
                        listAtrasados.push(x);
                    } else {
                        listAndamento.push(x);
                    }
                }
            }
        });
        
        previstos = listMeta.length;
        var total = allP.length;
        var completed = listCompleted.length;
        var andamento = listAndamento.length;
        var atrasados = listAtrasados.length;
        var reprovados = listReprovados.length;
    }
    
    // Save lists to instance for card clicks
    this.currentProjects = (state.dashboardFilterMonth && state.dashboardFilterMonth !== 'Todos') ? p_focused : allP;
    this.currentCompleted = listCompleted;
    this.currentAndamento = listAndamento;
    this.currentAtrasados = listAtrasados;
    this.currentReprovados = listReprovados;
    this.currentMeta = listMeta;
    
    var completedPct = total > 0 ? ((completed / total) * 100).toFixed(1) : '0.0';
    var andamentoPct = total > 0 ? ((andamento / total) * 100).toFixed(1) : '0.0';
    var atrasadosPct = total > 0 ? ((atrasados / total) * 100).toFixed(1) : '0.0';
    var reprovadosPct = total > 0 ? ((reprovados / total) * 100).toFixed(1) : '0.0';
    var metaPct = previstos > 0 ? ((realizados / previstos) * 100).toFixed(1) : '0.0';

    document.getElementById('kpi-total').textContent = total;
    document.getElementById('kpi-concluidos').innerHTML = completed + ' <span class="kpi-percent">(' + completedPct + '%)</span>';
    document.getElementById('kpi-andamento').innerHTML = andamento + ' <span class="kpi-percent">(' + andamentoPct + '%)</span>';
    document.getElementById('kpi-atrasados').innerHTML = atrasados + ' <span class="kpi-percent">(' + atrasadosPct + '%)</span>';
    
    var elReprovados = document.getElementById('kpi-reprovados');
    if (elReprovados) elReprovados.innerHTML = reprovados + ' <span class="kpi-percent">(' + reprovadosPct + '%)</span>';
    
    var elMeta = document.getElementById('kpi-meta-entregas');
    var elMetaPercent = document.getElementById('kpi-meta-percent');
    if (elMeta) elMeta.textContent = realizados + ' / ' + previstos;
    if (elMetaPercent) elMetaPercent.textContent = metaPct + '% das metas concluídas';
    
    // In bars/charts, use active projects in p_focused so that sector performance also aligns with the month filter
    this._bars(p_focused.filter(function(x) { return x.statusAtual !== 'Reprovado'; }));
    
    // Calculate critical projects: open delayed and closed delayed (excluding Reprovados)
    var openLate = [];
    var closedLate = [];
    
    p_focused.forEach(function (x) {
        if (!x.dataFimPrevista) return;
        if (x.statusAtual === 'Reprovado') return; // Exclude Reprovados from critical/delayed list
        
        var finishDateStr = x.dataFimReal;
        if (!finishDateStr && x.percentagemConclusao === 100 && x.historicoAtualizacoes) {
            var lastUpdate = x.historicoAtualizacoes.find(function(h) { return h.statusNovo === 'Concluído'; });
            if (lastUpdate && lastUpdate.dataAlteracao) {
                finishDateStr = lastUpdate.dataAlteracao.substring(0, 10);
            }
        }
        
        var limit = new Date(x.dataFimPrevista + 'T00:00:00');
        
        if (x.percentagemConclusao < 100) {
            var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
            var daysLate = Math.ceil((limit - hoje) / 864e5);
            if (daysLate < 0) {
                openLate.push(Object.assign({}, x, { daysLate: daysLate }));
            }
        } else {
            if (finishDateStr) {
                var fd = new Date(finishDateStr + 'T00:00:00');
                var daysLate = Math.ceil((limit - fd) / 864e5);
                if (daysLate < 0) {
                    closedLate.push(Object.assign({}, x, { daysLate: daysLate, completionDate: finishDateStr }));
                }
            }
        }
    });
    
    this._critical(openLate, closedLate);
    
    // Render Executive KPIs (Subpage)
    this._renderExecutiveKPIs(p_focused, state);
};

DashboardView.prototype._renderExecutiveKPIs = function (p_focused, state) {
    var container = document.getElementById('exec-kpis-grid');
    if (!container) return;

    var activeProjects = p_focused.filter(function (x) { return x.statusAtual !== 'Reprovado'; });

    // 1. Projetos Planejados
    var list1 = activeProjects.filter(function (x) { return x.dataFimPrevista; });
    var v1 = list1.length;

    // 2. Projetos Concluídos (%)
    var list2 = activeProjects.filter(function (x) { return x.percentagemConclusao === 100; });
    var v2Pct = activeProjects.length > 0 ? ((list2.length / activeProjects.length) * 100).toFixed(1) + '%' : '0.0%';
    var v2Val = v2Pct + ' <small style="font-size:0.85rem;font-weight:normal;color:var(--text-secondary)">(' + list2.length + '/' + activeProjects.length + ')</small>';

    // 3. Projetos em Atraso (%)
    var list3 = activeProjects.filter(function (x) { return x.percentagemConclusao < 100 && x.diasParaConclusaoPrevista !== null && x.diasParaConclusaoPrevista < 0; });
    var v3Pct = activeProjects.length > 0 ? ((list3.length / activeProjects.length) * 100).toFixed(1) + '%' : '0.0%';
    var v3Val = v3Pct + ' <small style="font-size:0.85rem;font-weight:normal;color:var(--text-secondary)">(' + list3.length + '/' + activeProjects.length + ')</small>';

    // 4. Lead Time dos Projetos (Planejados)
    var list4 = activeProjects.filter(function (x) { return x.dataInicio && x.dataFimPrevista; });
    var totalDaysPlanned = 0;
    list4.forEach(function (x) {
        var d1 = new Date(x.dataInicio + 'T00:00:00');
        var d2 = new Date(x.dataFimPrevista + 'T00:00:00');
        totalDaysPlanned += Math.max(0, Math.ceil((d2 - d1) / 864e5));
    });
    var v4Val = list4.length > 0 ? (totalDaysPlanned / list4.length).toFixed(1) + ' dias' : 'N/A';

    // 5. Lead Time dos Projetos (Realizados)
    var list5 = activeProjects.filter(function (x) { return x.percentagemConclusao === 100 && x.dataInicio && (x.dataFimReal || x.dataFimPrevista); });
    var totalDaysReal = 0;
    list5.forEach(function (x) {
        var endStr = x.dataFimReal || x.dataFimPrevista;
        var d1 = new Date(x.dataInicio + 'T00:00:00');
        var d2 = new Date(endStr + 'T00:00:00');
        totalDaysReal += Math.max(0, Math.ceil((d2 - d1) / 864e5));
    });
    var v5Val = list5.length > 0 ? (totalDaysReal / list5.length).toFixed(1) + ' dias' : 'N/A';

    // 6. Cumprimento de Cronograma (%)
    var list6 = activeProjects.filter(function (x) {
        if (x.percentagemConclusao === 100 && x.dataFimPrevista) {
            var endStr = x.dataFimReal || x.dataFimPrevista;
            return endStr <= x.dataFimPrevista;
        }
        return false;
    });
    var completedWithDates = activeProjects.filter(function (x) { return x.percentagemConclusao === 100 && x.dataFimPrevista; }).length;
    var v6Val = completedWithDates > 0 ? ((list6.length / completedWithDates) * 100).toFixed(1) + '%' : '100.0%';

    // 7. Processos Mapeados (%)
    var list7 = activeProjects.filter(function (x) { return x.tipo === 'Mapeamento Processos' && x.percentagemConclusao === 100; });
    var mapTotal = activeProjects.filter(function (x) { return x.tipo === 'Mapeamento Processos'; }).length;
    var v7Val = mapTotal > 0 ? ((list7.length / mapTotal) * 100).toFixed(1) + '%' + ' <small style="font-size:0.85rem;font-weight:normal;color:var(--text-secondary)">(' + list7.length + '/' + mapTotal + ')</small>' : '100.0%';

    // 8. Revisões de Processos Realizadas
    var list8 = activeProjects.filter(function (x) { return x.revisoes && x.revisoes.length > 0; });
    var totalRevisoes = 0;
    list8.forEach(function (x) { totalRevisoes += x.revisoes.length; });
    var v8Val = totalRevisoes + ' revisões';

    // 9. Índice de Atualização dos Procedimentos (%)
    var list9 = activeProjects.filter(function (x) { return (x.tipo || 'Procedimento') === 'Procedimento' && x.revisoes && x.revisoes.length > 0; });
    var procTotal = activeProjects.filter(function (x) { return (x.tipo || 'Procedimento') === 'Procedimento'; }).length;
    var v9Val = procTotal > 0 ? ((list9.length / procTotal) * 100).toFixed(1) + '%' + ' <small style="font-size:0.85rem;font-weight:normal;color:var(--text-secondary)">(' + list9.length + '/' + procTotal + ')</small>' : '0.0%';

    // 10. Tempo Médio de Aprovação de Fluxos
    var list10 = activeProjects.filter(function (x) {
        return x.historicoAtualizacoes && x.historicoAtualizacoes.some(function (h) { return h.statusNovo === 'Aprovação' || h.statusNovo === 'Concluído'; });
    });
    var totalAprovTime = 0; var countAprov = 0;
    list10.forEach(function (x) {
        var aprovEvent = x.historicoAtualizacoes.find(function (h) { return h.statusNovo === 'Aprovação' || h.statusNovo === 'Concluído'; });
        if (aprovEvent && x.dataInicio) {
            var dStart = new Date(x.dataInicio + 'T00:00:00');
            var dAprov = new Date(aprovEvent.dataAlteracao);
            totalAprovTime += Math.max(0, Math.ceil((dAprov - dStart) / 864e5));
            countAprov++;
        }
    });
    var v10Val = countAprov > 0 ? (totalAprovTime / countAprov).toFixed(1) + ' dias' : 'N/A';

    // 11. Não Conformidades Identificadas
    var inconformidadesList = AuthManager.filterByPermission(state.inconformidades || []);
    var filterSec = state.dashboardFilter;
    if (filterSec && filterSec !== 'Todos') {
        inconformidadesList = inconformidadesList.filter(function (i) {
            var s = i.setor || i.setor_registrou;
            return s === filterSec || (i.setoresAfetados && i.setoresAfetados.indexOf(filterSec) !== -1);
        });
    }
    if (state.dashboardFilterMonth && state.dashboardFilterMonth !== 'Todos') {
        var targetM = state.dashboardFilterMonth;
        inconformidadesList = inconformidadesList.filter(function (i) {
            return (i.dataRegistro && i.dataRegistro.substring(0, 7) === targetM) ||
                   (i.dataOcorrencia && i.dataOcorrencia.substring(0, 7) === targetM) ||
                   (i.dataCriacao && i.dataCriacao.substring(0, 7) === targetM);
        });
    }
    var list11 = inconformidadesList.map(function (i) {
        return {
            id: i.id,
            projeto: i.titulo || i.descricao || 'Não Conformidade',
            setor: i.setor || i.setor_registrou || 'Geral',
            percentagemConclusao: i.status === 'Finalizado' ? 100 : 0,
            statusAtual: i.status || 'Pendente',
            isInconformidade: true
        };
    });
    var v11Val = list11.length;

    // 12. Não Conformidades Tratadas (%)
    var list12 = inconformidadesList.filter(function (i) { return i.status === 'Finalizado'; }).map(function (i) {
        return {
            id: i.id,
            projeto: i.titulo || i.descricao || 'Não Conformidade',
            setor: i.setor || i.setor_registrou || 'Geral',
            percentagemConclusao: 100,
            statusAtual: 'Finalizado',
            isInconformidade: true
        };
    });
    var v12Val = list11.length > 0 ? ((list12.length / list11.length) * 100).toFixed(1) + '%' + ' <small style="font-size:0.85rem;font-weight:normal;color:var(--text-secondary)">(' + list12.length + '/' + list11.length + ')</small>' : '100.0%';

    this.execLists = {
        'planejados': { title: 'Projetos Planejados no Período', list: list1 },
        'concluidos': { title: 'Projetos Concluídos no Período', list: list2 },
        'atrasados': { title: 'Projetos em Atraso no Período', list: list3 },
        'lt_planejado': { title: 'Projetos com Lead Time Planejado', list: list4 },
        'lt_realizado': { title: 'Projetos Concluídos (Lead Time Realizado)', list: list5 },
        'cumprimento': { title: 'Projetos Entregues Dentro do Prazo', list: list6 },
        'mapeados': { title: 'Processos Mapeados e Concluídos', list: list7 },
        'revisoes': { title: 'Processos com Revisões Registradas', list: list8 },
        'atualizacao_proc': { title: 'Procedimentos Atualizados (Revisados)', list: list9 },
        'tempo_aprovacao': { title: 'Processos Submetidos à Aprovação', list: list10 },
        'inconformidades_id': { title: 'Não Conformidades Identificadas no Período', list: list11 },
        'inconformidades_tratadas': { title: 'Não Conformidades Tratadas (Finalizadas)', list: list12 }
    };

    function cardHtml(key, icon, title, objective, value, formula) {
        return '<div class="kpi-exec-card" data-exec-key="' + key + '" style="cursor:pointer;" title="Clique para ver os processos desta métrica">' +
               '  <div>' +
               '    <div class="kpi-exec-header">' +
               '      <div style="display:flex;align-items:center;gap:0.5rem;">' +
               '        <div class="kpi-icon" style="width:36px;height:36px;font-size:1.1rem;"><span class="material-symbols-rounded">' + icon + '</span></div>' +
               '        <h4 class="kpi-exec-title">' + title + '</h4>' +
               '      </div>' +
               '      <span class="material-symbols-rounded" style="font-size:1.1rem;color:var(--text-muted);opacity:0.7;">open_in_new</span>' +
               '    </div>' +
               '    <p class="kpi-exec-objective">' + objective + '</p>' +
               '    <div class="kpi-exec-value">' + value + '</div>' +
               '  </div>' +
               '  <div class="kpi-exec-formula" style="font-size:0.7rem;color:var(--text-secondary);background:var(--bg-elevated);padding:0.4rem 0.6rem;border-radius:var(--radius-sm);border:1px solid var(--border-color);display:flex;align-items:center;gap:0.35rem;">' +
               '    <span class="material-symbols-rounded" style="font-size:0.9rem;color:var(--text-muted)">functions</span> ' + formula +
               '  </div>' +
               '</div>';
    }

    var html = [
        cardHtml('planejados', 'account_tree', 'Projetos Planejados', 'Controlar pipeline de melhorias', v1, 'Nº de projetos planejados'),
        cardHtml('concluidos', 'check_circle', 'Projetos Concluídos (%)', 'Acompanhar execução das melhorias', v2Val, 'Projetos concluídos / Projetos planejados'),
        cardHtml('atrasados', 'warning', 'Projetos em Atraso (%)', 'Identificar desvios de cronograma', v3Val, 'Projetos em atraso / Total de projetos'),
        cardHtml('lt_planejado', 'schedule', 'Lead Time dos Projetos (Planejados)', 'Reduzir tempo de implementação', v4Val, 'Soma dos dias previstos / Nº de projetos'),
        cardHtml('lt_realizado', 'timer', 'Lead Time dos Projetos (Realizados)', 'Reduzir tempo de implementação', v5Val, 'Soma dos dias reais / Nº de projetos concluídos'),
        cardHtml('cumprimento', 'event_available', 'Cumprimento de Cronograma (%)', 'Garantir entrega dos marcos planejados', v6Val, 'Marcos concluídos no prazo / Total de marcos'),
        cardHtml('mapeados', 'map', 'Processos Mapeados (%)', 'Monitorar cobertura dos processos', v7Val, 'Processos mapeados / Total de processos'),
        cardHtml('revisoes', 'rate_review', 'Revisões de Processos Realizadas', 'Avaliar efetividade das iniciativas', v8Val, 'Nº de revisões concluídas'),
        cardHtml('atualizacao_proc', 'update', 'Índice de Atualização dos Procedimentos (%)', 'Garantir documentação atualizada', v9Val, 'Procedimentos revisados / Total de procedimentos'),
        cardHtml('tempo_aprovacao', 'speed', 'Tempo Médio de Aprovação de Fluxos', 'Reduzir gargalos operacionais', v10Val, 'Tempo total de aprovação / Nº de aprovações'),
        cardHtml('inconformidades_id', 'report_problem', 'Não Conformidades Identificadas', 'Identificar desvios', v11Val, 'Nº de não conformidades'),
        cardHtml('inconformidades_tratadas', 'task_alt', 'Não Conformidades Tratadas (%)', 'Garantir correção dos desvios', v12Val, 'Não conformidades tratadas / Total identificadas')
    ].join('');

    container.innerHTML = html;

    var self = this;
    container.querySelectorAll('.kpi-exec-card').forEach(function (card) {
        card.onclick = function () {
            var k = card.dataset.execKey;
            var data = self.execLists ? self.execLists[k] : null;
            if (data && window.openProjectsModal) {
                window.openProjectsModal(data.title, data.list);
            }
        };
    });
};

DashboardView.prototype._populateYears = function (projects) {
    var yearSelect = document.getElementById('picker-year-select');
    if (!yearSelect) return;
    
    var years = [new Date().getFullYear()];
    projects.forEach(function (p) {
        if (p.dataInicio) {
            var y = new Date(p.dataInicio + 'T00:00:00').getFullYear();
            if (!isNaN(y) && !years.includes(y)) years.push(y);
        }
        var endStr = p.dataFimReal || p.dataFimPrevista;
        if (endStr) {
            var y = new Date(endStr + 'T00:00:00').getFullYear();
            if (!isNaN(y) && !years.includes(y)) years.push(y);
        }
    });
    
    years.sort(function (a, b) { return a - b; });
    
    var html = years.map(function (y) {
        return '<option value="' + y + '">' + y + '</option>';
    }).join('');
    
    if (yearSelect.innerHTML !== html) {
        yearSelect.innerHTML = html;
    }
};

DashboardView.prototype._updatePickerState = function (currentValue) {
    var labelMonth = document.getElementById('dashboard-month-label');
    var yearSelect = document.getElementById('picker-year-select');
    var monthButtons = document.querySelectorAll('.picker-month-btn');
    
    if (!labelMonth) return;
    
    var monthNames = {
        '01': 'Janeiro', '02': 'Fevereiro', '03': 'Março', '04': 'Abril',
        '05': 'Maio', '06': 'Junho', '07': 'Julho', '08': 'Agosto',
        '09': 'Setembro', '10': 'Outubro', '11': 'Novembro', '12': 'Dezembro'
    };
    
    monthButtons.forEach(function (btn) { btn.classList.remove('selected'); });
    
    if (currentValue === 'Todos' || !currentValue) {
        labelMonth.textContent = 'Todas as competências';
        if (yearSelect && !this.selectedYear) {
            this.selectedYear = new Date().getFullYear();
            yearSelect.value = this.selectedYear;
        }
    } else {
        var parts = currentValue.split('-'); // YYYY-MM
        var year = parseInt(parts[0], 10);
        var monthStr = parts[1];
        
        var monthName = monthNames[monthStr] || monthStr;
        labelMonth.textContent = monthName + '/' + year;
        
        if (!this.popoverOpen) {
            this.selectedYear = year;
            if (yearSelect) yearSelect.value = year;
        }
        
        if (this.selectedYear === year) {
            monthButtons.forEach(function (btn) {
                if (btn.dataset.month === monthStr) {
                    btn.classList.add('selected');
                }
            });
        }
    }
};

DashboardView.prototype._initEvents = function () {
    var self = this;
    var btnComp = document.getElementById('btn-dashboard-competence');
    var popover = document.getElementById('dashboard-competence-popover');
    var yearSelect = document.getElementById('picker-year-select');
    var monthButtons = document.querySelectorAll('.picker-month-btn');
    var btnClear = document.getElementById('picker-btn-clear');
    var btnCurrent = document.getElementById('picker-btn-current');
    
    // Subnav tabs switching
    var subtabs = document.querySelectorAll('.dashboard-subtab');
    subtabs.forEach(function (tab) {
        tab.addEventListener('click', function () {
            var target = tab.dataset.dashSubview;
            subtabs.forEach(function (t) { t.classList.remove('active'); });
            tab.classList.add('active');
            
            var viewOverview = document.getElementById('dash-subview-overview');
            var viewKpis = document.getElementById('dash-subview-kpis');
            if (viewOverview && viewKpis) {
                if (target === 'kpis') {
                    viewOverview.style.display = 'none';
                    viewOverview.classList.remove('active');
                    viewKpis.style.display = 'block';
                    viewKpis.classList.add('active');
                } else {
                    viewOverview.style.display = 'block';
                    viewOverview.classList.add('active');
                    viewKpis.style.display = 'none';
                    viewKpis.classList.remove('active');
                }
            }
        });
    });
    
    if (btnComp && popover) {
        btnComp.addEventListener('click', function (e) {
            e.stopPropagation();
            var isOpen = popover.style.display === 'block';
            popover.style.display = isOpen ? 'none' : 'block';
            self.popoverOpen = !isOpen;
            
            if (self.popoverOpen) {
                var cur = appStore.state.dashboardFilterMonth;
                if (cur && cur !== 'Todos') {
                    self.selectedYear = parseInt(cur.split('-')[0], 10);
                } else {
                    self.selectedYear = new Date().getFullYear();
                }
                if (yearSelect) yearSelect.value = self.selectedYear;
                self._updatePickerState(cur);
            }
        });
    }
    
    document.addEventListener('click', function (e) {
        if (popover && popover.style.display === 'block') {
            if (!popover.contains(e.target) && e.target !== btnComp && !btnComp.contains(e.target)) {
                popover.style.display = 'none';
                self.popoverOpen = false;
            }
        }
    });
    
    if (yearSelect) {
        yearSelect.addEventListener('change', function () {
            self.selectedYear = parseInt(this.value, 10);
            self._updatePickerState(appStore.state.dashboardFilterMonth);
        });
        yearSelect.addEventListener('click', function (e) { e.stopPropagation(); });
    }
    
    monthButtons.forEach(function (btn) {
        btn.addEventListener('click', function (e) {
            e.stopPropagation();
            var m = btn.dataset.month;
            var y = self.selectedYear || new Date().getFullYear();
            var value = y + '-' + m;
            
            appStore.setDashboardFilterMonth(value);
            
            if (popover) {
                popover.style.display = 'none';
                self.popoverOpen = false;
            }
        });
    });
    
    if (btnClear) {
        btnClear.addEventListener('click', function (e) {
            e.stopPropagation();
            appStore.setDashboardFilterMonth('Todos');
            if (popover) {
                popover.style.display = 'none';
                self.popoverOpen = false;
            }
        });
    }
    
    if (btnCurrent) {
        btnCurrent.addEventListener('click', function (e) {
            e.stopPropagation();
            var now = new Date();
            var m = String(now.getMonth() + 1).padStart(2, '0');
            var y = now.getFullYear();
            appStore.setDashboardFilterMonth(y + '-' + m);
            if (popover) {
                popover.style.display = 'none';
                self.popoverOpen = false;
            }
        });
    }
    
    // Bind click handlers to KPI cards
    var cardTotal = document.getElementById('card-kpi-total');
    var cardConcluidos = document.getElementById('card-kpi-concluidos');
    var cardAndamento = document.getElementById('card-kpi-andamento');
    var cardAtrasados = document.getElementById('card-kpi-atrasados');
    var cardReprovados = document.getElementById('card-kpi-reprovados');
    var cardMeta = document.getElementById('card-kpi-meta');
    
    function openProjectsModal(title, list) {
        var modal = document.getElementById('modal-dashboard-projects');
        var modalTitle = document.getElementById('modal-dashboard-projects-title');
        var modalList = document.getElementById('modal-dashboard-projects-list');
        if (!modal || !modalTitle || !modalList) return;
        
        modalTitle.textContent = title;
        var session = AuthManager.getSession();
        
        if (list.length === 0) {
            modalList.innerHTML = '<span style="color:var(--text-muted);font-size:0.8rem;text-align:center;padding:1rem;display:block;">Nenhum item correspondente encontrado.</span>';
        } else {
            modalList.innerHTML = list.map(function (p) {
                if (p.isInconformidade) {
                    return '<div class="project-list-item" style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:var(--radius-md); transition:var(--transition-fast);cursor:pointer;" onclick="document.getElementById(\'modal-dashboard-projects\').close(); window.openInconformidadeEditor && window.openInconformidadeEditor(\'' + p.id + '\')">' +
                           '  <div style="display:flex;flex-direction:column;gap:0.25rem;">' +
                           '    <span style="font-weight:600;color:var(--text-primary);font-size:0.9rem;">' + p.projeto + '</span>' +
                           '    <span style="font-size:0.75rem;color:var(--text-secondary);">' + p.setor + ' | Status: ' + p.statusAtual + '</span>' +
                           '  </div>' +
                           '  <div style="display:flex;gap:0.5rem;flex-shrink:0;">' +
                           '    <button class="btn btn-sm btn-outline" style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.75rem;padding:0.25rem 0.5rem;"><span class="material-symbols-rounded" style="font-size:1.1em">visibility</span> Abrir</button>' +
                           '  </div>' +
                           '</div>';
                }

                var editBtnHtml = '';
                if (session && AuthManager.canCreateOrEdit() && (session.nivelAcesso === 'Admin' || p.setor === session.setorBase)) {
                    editBtnHtml = '<button class="btn btn-sm btn-primary" style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.75rem;padding:0.25rem 0.5rem;" onclick="event.stopPropagation(); document.getElementById(\'modal-dashboard-projects\').close(); openEditor(\'' + p.id + '\')"><span class="material-symbols-rounded" style="font-size:1.1em">edit</span> Editar</button>';
                }
                return '<div class="project-list-item" style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem;background:var(--bg-elevated);border:1px solid var(--border-color);border-radius:var(--radius-md); transition:var(--transition-fast);cursor:pointer;" onclick="document.getElementById(\'modal-dashboard-projects\').close(); openOffcanvas(\'' + p.id + '\')">' +
                       '  <div style="display:flex;flex-direction:column;gap:0.25rem;">' +
                       '    <span style="font-weight:600;color:var(--text-primary);font-size:0.9rem;">' + p.projeto + '</span>' +
                       '    <span style="font-size:0.75rem;color:var(--text-secondary);">' + p.setor + ' | Tipo: ' + (p.tipo || 'Procedimento') + ' | Progresso: ' + (p.percentagemConclusao || 0) + '% | Status: ' + p.statusAtual + '</span>' +
                       '  </div>' +
                       '  <div style="display:flex;gap:0.5rem;flex-shrink:0;">' +
                       '    <button class="btn btn-sm btn-outline" style="display:inline-flex;align-items:center;gap:0.25rem;font-size:0.75rem;padding:0.25rem 0.5rem;" onclick="event.stopPropagation(); document.getElementById(\'modal-dashboard-projects\').close(); openOffcanvas(\'' + p.id + '\')"><span class="material-symbols-rounded" style="font-size:1.1em">visibility</span> Detalhes</button>' +
                       '    ' + editBtnHtml + '  </div>' +
                       '</div>';
            }).join('');
        }
        modal.showModal();
    }
    window.openProjectsModal = openProjectsModal;
    
    if (cardTotal) {
        cardTotal.addEventListener('click', function () {
            openProjectsModal('Todos os Processos', self.currentProjects || []);
        });
    }
    if (cardConcluidos) {
        cardConcluidos.addEventListener('click', function () {
            openProjectsModal('Processos Concluídos no Período', self.currentCompleted || []);
        });
    }
    if (cardAndamento) {
        cardAndamento.addEventListener('click', function () {
            openProjectsModal('Processos Em Andamento no Período', self.currentAndamento || []);
        });
    }
    if (cardAtrasados) {
        cardAtrasados.addEventListener('click', function () {
            openProjectsModal('Processos Em Atraso no Período', self.currentAtrasados || []);
        });
    }
    if (cardReprovados) {
        cardReprovados.addEventListener('click', function () {
            openProjectsModal('Processos Reprovados no Período', self.currentReprovados || []);
        });
    }
    if (cardMeta) {
        cardMeta.addEventListener('click', function () {
            openProjectsModal('Metas de Entrega do Período (Previsto)', self.currentMeta || []);
        });
    }
};

DashboardView.prototype._tabs = function (cur, sectors) {
    var el = document.getElementById('dashboard-sector-tabs');
    var all = ['Todos'].concat(sectors);
    el.innerHTML = all.map(function (s) {
        return '<button class="tab ' + (cur === s ? 'active' : '') + '" data-dsf="' + s + '">' + s + '</button>';
    }).join('');
    el.querySelectorAll('.tab').forEach(function (b) {
        b.onclick = function () { appStore.setDashboardFilter(b.dataset.dsf); };
    });
};

DashboardView.prototype._bars = function (projects) {
    var map = {};
    projects.forEach(function (p) {
        if (!map[p.setor]) map[p.setor] = { t: 0, sum: 0 };
        map[p.setor].t++; map[p.setor].sum += (p.percentagemConclusao || 0);
    });
    var html = Object.keys(map).map(function (n) {
        var avg = (map[n].sum / map[n].t).toFixed(1);
        return '<div class="sector-bar"><div class="sb-header"><span>' + n + '</span><span>' + avg + '%</span></div><div class="sb-track"><div class="sb-fill" style="width:' + avg + '%"></div></div></div>';
    }).join('');
    document.getElementById('sector-bars-container').innerHTML = html || '<p style="color:var(--text-muted);font-size:0.8rem">Sem dados.</p>';
};

DashboardView.prototype._critical = function (openLate, closedLate) {
    var el = document.getElementById('critical-projects-list');
    if (!el) return;
    
    function formatDate(dateStr) {
        if (!dateStr) return '';
        var parts = dateStr.split('-');
        if (parts.length !== 3) return dateStr;
        return parts[2] + '/' + parts[1] + '/' + parts[0];
    }
    
    var html = '';
    
    // 1. Em Aberto
    html += '<div style="font-size:0.8rem; font-weight:600; text-transform:uppercase; color:var(--text-muted); margin-bottom:0.5rem;">Em Aberto</div>';
    if (openLate.length === 0) {
        html += '<div style="color:var(--text-muted); font-size:0.75rem; margin-bottom:1rem; padding-left:0.5rem;">Nenhum projeto em atraso aberto.</div>';
    } else {
        html += '<div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">' +
            openLate.map(function (p) {
                var daysVal = p.daysLate;
                var daysText = daysVal < 0 ? daysVal + 'd' : '-' + daysVal + 'd';
                return '<div class="critical-item" data-id="' + p.id + '" style="cursor:pointer;"><div style="flex:1;font-weight:600;font-size:0.85rem;">' + 
                    p.projeto + 
                    ' <span style="font-size:0.75rem; font-weight:normal; color:var(--text-secondary); margin-left:0.5rem;">(Previsto: ' + formatDate(p.dataFimPrevista) + ')</span>' +
                    ' <span class="badge badge-default">' + p.setor + '</span>' +
                    '</div><strong style="display:flex;align-items:center;gap:4px;color:var(--color-danger)"><span class="material-symbols-rounded" style="font-size:1.1em">warning</span> ' + daysText + '</strong></div>';
            }).join('') + '</div>';
    }
    
    // 2. Fechados com Atraso
    html += '<div style="font-size:0.8rem; font-weight:600; text-transform:uppercase; color:var(--text-muted); margin-bottom:0.5rem; margin-top:0.5rem;">Concluídos com Atraso</div>';
    if (closedLate.length === 0) {
        html += '<div style="color:var(--text-muted); font-size:0.75rem; padding-left:0.5rem;">Nenhum projeto concluído com atraso.</div>';
    } else {
        html += '<div style="display:flex; flex-direction:column; gap:0.5rem;">' +
            closedLate.map(function (p) {
                var daysVal = p.daysLate;
                var daysText = daysVal < 0 ? daysVal + 'd' : '-' + daysVal + 'd';
                var finishDate = p.dataFimReal || p.completionDate;
                return '<div class="critical-item" data-id="' + p.id + '" style="cursor:pointer;"><div style="flex:1;font-weight:600;font-size:0.85rem;">' + 
                    p.projeto + 
                    ' <span style="font-size:0.75rem; font-weight:normal; color:var(--text-secondary); margin-left:0.5rem;">(Previsto: ' + formatDate(p.dataFimPrevista) + ' | Fim: ' + formatDate(finishDate) + ')</span>' +
                    ' <span class="badge badge-default">' + p.setor + '</span>' +
                    '</div><strong style="display:flex;align-items:center;gap:4px;color:var(--text-muted)"><span class="material-symbols-rounded" style="font-size:1.1em">check_circle</span> ' + daysText + '</strong></div>';
            }).join('') + '</div>';
    }
    
    el.innerHTML = html;
    
    // Bind click events on critical items to open modal
    el.querySelectorAll('.critical-item').forEach(function (item) {
        item.onclick = function () {
            var projectId = item.dataset.id;
            openOffcanvas(projectId);
        };
    });
};

// =========================================================================
// KANBAN
// =========================================================================
function KanbanView() {
    appStore.subscribe(this.render.bind(this));
}
KanbanView.prototype.render = function (state) {
    var visible = AuthManager.filterByPermission(state.projects).filter(function (p) {
        return p.statusAtual !== 'Reprovado';
    });
    var visSectors = AuthManager.visibleSectors();
    var curSector = state.currentFilter || 'Todos';
    var curType = state.typeFilter || 'Todos';

    this._filters(curSector, visSectors);
    this._typeFilters(curType, state.projects);

    var filtered = visible.filter(function (p) {
        var matchSector = curSector === 'Todos' || p.setor === curSector;
        var pType = p.tipo || 'Procedimento';
        var matchType = curType === 'Todos' || pType === curType;
        return matchSector && matchType;
    });

    // Ordenar do vencimento mais próximo ao mais distante (e sem prazo por último)
    filtered.sort(function (a, b) {
        if (a.dataFimPrevista && b.dataFimPrevista) {
            return a.dataFimPrevista.localeCompare(b.dataFimPrevista);
        }
        if (a.dataFimPrevista) return -1;
        if (b.dataFimPrevista) return 1;
        return 0;
    });

    var cont = document.getElementById('kanban-container');
    if (!cont) return;

    if (filtered.length === 0) {
        cont.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem 1rem;color:var(--text-muted);background:var(--card-bg);border:1px dashed var(--border-color);border-radius:var(--radius-lg);">' +
            '<span class="material-symbols-rounded" style="font-size:3rem;margin-bottom:0.5rem;color:var(--text-muted)">filter_alt_off</span>' +
            '<p style="font-size:0.95rem;font-weight:500;">Nenhum processo encontrado para os filtros selecionados.</p>' +
            '</div>';
        return;
    }

    cont.innerHTML = filtered.map(this._card).join('');
    cont.querySelectorAll('.kanban-card').forEach(function (c) {
        c.onclick = function () { openOffcanvas(c.dataset.id); };
    });
};

KanbanView.prototype._filters = function (cur, sectors) {
    var el = document.getElementById('sector-filters');
    if (!el) return;
    el.innerHTML = ['Todos'].concat(sectors).map(function (s) {
        return '<button class="tab ' + (cur === s ? 'active' : '') + '" data-sf="' + s + '">' + s + '</button>';
    }).join('');
    el.querySelectorAll('.tab').forEach(function (b) {
        b.onclick = function () { appStore.setFilter(b.dataset.sf); };
    });
};

KanbanView.prototype._typeFilters = function (curType, projects) {
    var el = document.getElementById('type-filters');
    if (!el) return;

    var defaultTypes = ['Procedimento', 'Política', 'Manual', 'Formulário', 'Projeto', 'Inovação Tecnológica', 'Mapeamento Processos'];
    var typeSet = new Set(defaultTypes);
    (projects || []).forEach(function (p) {
        if (p.tipo) typeSet.add(p.tipo);
    });

    var allTypes = ['Todos'].concat(Array.from(typeSet));

    el.innerHTML = allTypes.map(function (t) {
        return '<button class="tab ' + (curType === t ? 'active' : '') + '" data-tf="' + t + '">' + t + '</button>';
    }).join('');

    el.querySelectorAll('.tab').forEach(function (b) {
        b.onclick = function () { appStore.setTypeFilter(b.dataset.tf); };
    });
};
function formatDate(dateStr) {
    if (!dateStr) return '—';
    var parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    return parts[2] + '/' + parts[1] + '/' + parts[0];
}

KanbanView.prototype._card = function (p) {
    var late = p.diasParaConclusaoPrevista !== null && p.diasParaConclusaoPrevista < 0;
    var bc = 'badge-default';
    if (p.statusAtual === 'Reprovado') bc = 'badge-reprovado';
    else if (p.percentagemConclusao === 100) bc = 'badge-success';
    else if (late) bc = 'badge-warning';
    else if (p.percentagemConclusao > 0) bc = 'badge-progress';
    var days = p.diasParaConclusaoPrevista === null ? 'Sem previs\u00e3o' : (late ? Math.abs(p.diasParaConclusaoPrevista) + 'd atrasado' : p.diasParaConclusaoPrevista + 'd restantes');
    var fillStyle = 'width:' + p.percentagemConclusao + '%;' + (p.percentagemConclusao === 100 ? 'background:var(--color-success)' : '');
    
    var prev = formatDate(p.dataFimPrevista);
    var real = p.dataFimReal ? formatDate(p.dataFimReal) : '—';
    
    var editBtnHtml = '';
    var session = AuthManager.getSession();
    if (session && AuthManager.canCreateOrEdit() && (session.nivelAcesso === 'Admin' || p.setor === session.setorBase)) {
        editBtnHtml = '<button class="btn btn-sm btn-outline" title="Editar" onclick="event.stopPropagation();openEditor(\'' + p.id + '\')" style="display:flex;align-items:center;justify-content:center"><span class="material-symbols-rounded" style="font-size:1.1em">edit</span></button>';
    }

    var tipoClass = 'badge-procedimento';
    if (p.tipo === 'Pol\u00edtica' || p.tipo === 'Política') tipoClass = 'badge-politica';
    else if (p.tipo === 'Manual') tipoClass = 'badge-manual';
    else if (p.tipo === 'Formul\u00e5rio' || p.tipo === 'Formulário') tipoClass = 'badge-formulario';
    var tipoBadge = '<span class="badge-tipo ' + tipoClass + '">' + (p.tipo || 'Procedimento') + '</span>';
    
    var revisionHtml = '';
    if (p.percentagemConclusao === 100) {
        var daysStr = 'Nenhuma revisão';
        if (p.revisoes && p.revisoes.length > 0) {
            var dates = p.revisoes.map(function(r) { return new Date(r.dataRevisao + 'T00:00:00'); });
            var maxDate = new Date(Math.max.apply(null, dates));
            var hoje = new Date();
            hoje.setHours(0, 0, 0, 0);
            maxDate.setHours(0, 0, 0, 0);
            var diffTime = hoje - maxDate;
            var diffDays = Math.floor(diffTime / 864e5);
            if (diffDays === 0) {
                daysStr = 'Revisado hoje';
            } else if (diffDays === 1) {
                daysStr = 'Revisado ontem';
            } else {
                daysStr = 'Revisado há ' + diffDays + ' dias';
            }
        }
        revisionHtml = '<div class="kc-revision-info" style="display:flex;align-items:center;gap:4px;font-size:0.72rem;color:var(--text-secondary);margin-bottom:0.75rem;background:rgba(46,158,92,0.06);padding:0.35rem 0.55rem;border-radius:var(--radius-md);border:1px solid rgba(46,158,92,0.15);"><span class="material-symbols-rounded" style="font-size:1.15em;color:var(--accent-primary)">update</span><span>' + daysStr + '</span></div>';
    }

    return '<div class="kanban-card ' + (late ? 'atrasado' : '') + '" data-id="' + p.id + '">' +
        '<div class="kc-sector" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.4rem;"><span>' + p.setor + '</span>' + tipoBadge + '</div>' +
        '<div class="kc-title">' + p.projeto + '</div>' +
        '<div class="kc-progress-lay"><div class="kc-progress-text"><span class="badge ' + bc + '">' + p.statusAtual + '</span><span>' + p.percentagemConclusao + '%</span></div><div class="kc-track"><div class="kc-fill" style="' + fillStyle + '"></div></div></div>' +
        '<div class="kc-dates">' +
        '  <div class="kc-date-item"><span class="kc-date-label">Venc. Previsto:</span><span class="kc-date-value">' + prev + '</span></div>' +
        '  <div class="kc-date-item"><span class="kc-date-label">Venc. Real:</span><span class="kc-date-value">' + real + '</span></div>' +
        '</div>' +
        revisionHtml +
        '<div class="kc-footer"><div class="kc-days ' + (late ? 'danger' : '') + '" style="display:flex;align-items:center;gap:4px;"><span class="material-symbols-rounded" style="font-size:1em">schedule</span> ' + days + '</div>' +
        editBtnHtml + '</div></div>';
};

// =========================================================================
// ADMIN
// =========================================================================
function AdminView() {
    appStore.subscribe(this.render.bind(this));
}
AdminView.prototype.render = function (state) {
    if (!AuthManager.isAdmin()) return;
    document.getElementById('admin-sectors-list').innerHTML = state.sectors.map(function (s) {
        return '<div class="admin-list-item">' +
            '<span class="admin-item-name">' + s + '</span>' +
            '<div class="admin-item-actions">' +
            '<button class="btn btn-sm btn-outline" onclick="openSectorEditor(\'' + s.replace(/'/g, "\\'") + '\')" style="display:flex;align-items:center"><span class="material-symbols-rounded" style="font-size:1.1em">edit</span></button>' +
            '</div>' +
            '</div>';
    }).join('') || '<p style="color:var(--text-muted);font-size:0.8rem">Nenhum setor.</p>';

    document.getElementById('admin-users-list').innerHTML = state.users.map(function (u) {
        var vis = (u.setoresVisiveis && u.setoresVisiveis.indexOf('__ALL__') !== -1) ? 'Todos' : (u.setoresVisiveis || []).join(', ');
        return '<div class="admin-list-item"><div class="admin-item-info"><span class="admin-item-name">' + u.nome + '</span><span class="admin-item-meta">' + u.login + ' \u00b7 ' + u.nivelAcesso + ' \u00b7 ' + vis + '</span></div>' +
            '<div class="admin-item-actions"><button class="btn btn-sm btn-outline" onclick="openUserEditor(\'' + u.id + '\')" style="display:flex;align-items:center"><span class="material-symbols-rounded" style="font-size:1.1em">edit</span></button>' +
            '<button class="btn btn-sm btn-danger" onclick="appStore.removeUser(\'' + u.id + '\')" style="display:flex;align-items:center"><span class="material-symbols-rounded" style="font-size:1.1em">delete</span></button></div></div>';
    }).join('');

    var statusesList = document.getElementById('admin-statuses-list');
    if (statusesList) {
        statusesList.innerHTML = (state.statuses || []).map(function (s) {
            return '<div class="admin-list-item">' +
                '<div class="admin-item-info">' +
                '  <span class="admin-item-name">' + s.nome + '</span>' +
                '  <span class="admin-item-meta">' + s.percentagem + '%</span>' +
                '</div>' +
                '<div class="admin-item-actions">' +
                '  <button class="btn btn-sm btn-outline" onclick="openStatusEditor(\'' + s.id + '\')" style="display:flex;align-items:center"><span class="material-symbols-rounded" style="font-size:1.1em">edit</span></button>' +
                '  <button class="btn btn-sm btn-danger" onclick="appStore.deleteStatus(\'' + s.id + '\')" style="display:flex;align-items:center"><span class="material-symbols-rounded" style="font-size:1.1em">delete</span></button>' +
                '</div>' +
                '</div>';
        }).join('') || '<p style="color:var(--text-muted);font-size:0.8rem">Nenhum status.</p>';
    }

    var logsList = document.getElementById('admin-logs-list');
    if (logsList) {
        logsList.innerHTML = (state.logs || []).map(function (log) {
            var dateStr;
            try {
                dateStr = new Date(log.timestamp).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
            } catch (e) {
                dateStr = log.timestamp;
            }
            return '<div class="admin-log-item" style="border-bottom: 1px solid var(--border-color); padding: 0.75rem 1.25rem; display: flex; flex-direction: column; gap: 4px;">' +
                '<div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.75rem; color: var(--text-muted);">' +
                '<span><strong>' + log.usuarioNome + '</strong> (' + log.usuarioLogin + ')</span>' +
                '<span>' + dateStr + '</span>' +
                '</div>' +
                '<div style="font-size: 0.85rem; color: var(--text-primary); font-weight: 500;">' + log.acao + '</div>' +
                (log.detalhes ? '<div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 2px;">' + log.detalhes + '</div>' : '') +
                '</div>';
        }).join('') || '<p style="color:var(--text-muted);font-size:0.8rem;padding:1.25rem;">Nenhum log de ações registrado.</p>';
    }
};

// =========================================================================
// OFFCANVAS
// =========================================================================
function openOffcanvas(id) {
    var p = appStore.getProjectById(id); if (!p) return;
    document.getElementById('detail-sector').textContent = p.setor;
    document.getElementById('detail-title').textContent = p.projeto;
    document.getElementById('detail-dias').textContent = p.diasParaConclusaoPrevista != null ? p.diasParaConclusaoPrevista : 'N/A';
    document.getElementById('detail-percent').textContent = (p.percentagemConclusao || 0) + '%';
    
    // Reset inputs and tabs to default (timeline active)
    var revProjectId = document.getElementById('revision-project-id');
    var revDate = document.getElementById('revision-date');
    var revComment = document.getElementById('revision-comment');
    if (revProjectId) revProjectId.value = p.id;
    if (revDate) revDate.value = new Date().toISOString().split('T')[0];
    if (revComment) revComment.value = '';

    var tabTimelineBtn = document.getElementById('tab-timeline-btn');
    var tabRevisionsBtn = document.getElementById('tab-revisions-btn');
    var tabTimelineContent = document.getElementById('offcanvas-tab-timeline');
    var tabRevisionsContent = document.getElementById('offcanvas-tab-revisions');
    
    if (tabTimelineBtn && tabRevisionsBtn && tabTimelineContent && tabRevisionsContent) {
        tabTimelineBtn.classList.add('active');
        tabRevisionsBtn.classList.remove('active');
        tabTimelineContent.style.display = 'block';
        tabRevisionsContent.style.display = 'none';
    }

    var hist = (p.historicoAtualizacoes || []).slice().reverse();
    document.getElementById('detail-timeline').innerHTML = hist.map(function (h) {
        var d;
        try { d = new Date(h.dataAlteracao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { d = h.dataAlteracao; }
        return '<div class="timeline-item"><div class="tl-date">' + d + '</div><div class="tl-content"><h4>' + h.statusNovo + '</h4><p style="font-size:0.65rem;color:var(--text-muted)">Anterior: ' + h.statusAnterior + '</p><p>' + h.observacao + '</p></div></div>';
    }).join('') || '<p style="color:var(--text-muted)">Sem hist\u00f3rico.</p>';

    // Render revisions
    var listContainer = document.getElementById('detail-revisions-list');
    if (listContainer) {
        var revs = (p.revisoes || []).slice().reverse();
        listContainer.innerHTML = revs.map(function (r) {
            return '<div class="revision-item">' +
                   '  <div class="revision-header">' +
                   '    <span><strong class="revision-user">' + r.usuarioNome + '</strong></span>' +
                   '    <span>' + formatDate(r.dataRevisao) + '</span>' +
                   '  </div>' +
                   '  <div class="revision-comment">' + r.comentario + '</div>' +
                   '</div>';
        }).join('') || '<p style="color:var(--text-muted);font-size:0.75rem;">Nenhuma revisão registrada.</p>';
    }

    document.getElementById('global-modal-overlay').classList.add('show');
    document.getElementById('offcanvas-details').classList.add('show');
}
window.openOffcanvas = openOffcanvas;

// =========================================================================
// MODAL HELPERS
// =========================================================================
function showOverlay() { document.getElementById('global-modal-overlay').classList.add('show'); }

function closeAll() {
    document.querySelectorAll('dialog[open]').forEach(function (d) { d.close(); });
    document.getElementById('global-modal-overlay').classList.remove('show');
    document.getElementById('offcanvas-details').classList.remove('show');
}

function openEditor(id) {
    var session = AuthManager.getSession();
    if (!session) return;

    if (!AuthManager.canCreateOrEdit()) {
        alert('Acesso negado: Seu nível de acesso não possui permissão para criar ou editar projetos.');
        return;
    }

    if (id) {
        var p = appStore.getProjectById(id);
        if (!p) return;
        if (session.nivelAcesso !== 'Admin' && p.setor !== session.setorBase) {
            alert('Acesso negado: Você não tem permissão para editar projetos de outro setor.');
            return;
        }
    }

    var form = document.getElementById('process-form');
    form.reset();

    var sel = document.getElementById('field-setor');
    if (session.nivelAcesso === 'Admin') {
        sel.innerHTML = appStore.state.sectors.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
        sel.disabled = false;
    } else {
        var userSector = session.setorBase || 'Geral';
        sel.innerHTML = '<option value="' + userSector + '">' + userSector + '</option>';
        sel.value = userSector;
        sel.disabled = true;
    }

    var selStatus = document.getElementById('field-status');
    var statusOpts = appStore.state.statuses.map(function (s) {
        return '<option value="' + s.nome + '">' + s.nome + ' (' + s.percentagem + '%)</option>';
    });
    var hasReprovado = appStore.state.statuses.some(function(s) { return s.nome === 'Reprovado'; });
    if (!hasReprovado) {
        statusOpts.push('<option value="Reprovado">Reprovado (0%)</option>');
    }
    selStatus.innerHTML = statusOpts.join('');

    var selectTipo = document.getElementById('field-tipo');
    if (selectTipo) {
        selectTipo.disabled = false;
    }

    // Reset tabs to default (data tab active)
    var tabDataBtn = document.getElementById('dialog-tab-data-btn');
    var tabRevisionsBtn = document.getElementById('dialog-tab-revisions-btn');
    var tabDataContent = document.getElementById('dialog-tab-content-data');
    var tabRevisionsContent = document.getElementById('dialog-tab-content-revisions');
    var dialogFooter = document.querySelector('#process-editor-dialog .dialog-footer');
    
    if (tabDataBtn && tabRevisionsBtn && tabDataContent && tabRevisionsContent) {
        tabDataBtn.classList.add('active');
        tabRevisionsBtn.classList.remove('active');
        tabDataContent.classList.add('active');
        tabRevisionsContent.classList.remove('active');
        if (dialogFooter) dialogFooter.style.display = 'flex';
    }

    if (id) {
        document.getElementById('dialog-title').textContent = 'Atualizar Projeto';
        var p = appStore.getProjectById(id);
        document.getElementById('field-id').value = p.id;
        document.getElementById('field-projeto').value = p.projeto;
        if (session.nivelAcesso !== 'Admin') {
            sel.innerHTML = '<option value="' + p.setor + '">' + p.setor + '</option>';
            sel.value = p.setor;
            sel.disabled = true;
        } else {
            sel.value = p.setor;
        }
        selStatus.value = p.statusAtual;
        if (selectTipo) {
            selectTipo.value = p.tipo || 'Procedimento';
        }
        document.getElementById('field-data-inicio').value = p.dataInicio || '';
        document.getElementById('field-data-fim-prevista').value = p.dataFimPrevista || '';
        document.getElementById('field-data-fim-real').value = p.dataFimReal || '';
        document.getElementById('update-observation-wrap').style.display = 'block';
        document.getElementById('btn-delete-project').style.display = AuthManager.canDelete() ? 'inline-flex' : 'none';
        
        // Show tabs
        document.getElementById('process-dialog-tabs').style.display = 'flex';
        
        // Populate and render revisions in dialog
        document.getElementById('dialog-revision-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('dialog-revision-comment').value = '';
        var listContainer = document.getElementById('dialog-revisions-list');
        if (listContainer) {
            var revs = (p.revisoes || []).slice().reverse();
            listContainer.innerHTML = revs.map(function (r) {
                return '<div class="revision-item">' +
                       '  <div class="revision-header">' +
                       '    <span><strong class="revision-user">' + r.usuarioNome + '</strong></span>' +
                       '    <span>' + formatDate(r.dataRevisao) + '</span>' +
                       '  </div>' +
                       '  <div class="revision-comment">' + r.comentario + '</div>' +
                       '</div>';
            }).join('') || '<p style="color:var(--text-muted);font-size:0.75rem;">Nenhuma revisão registrada.</p>';
        }
    } else {
        document.getElementById('dialog-title').textContent = 'Novo Projeto';
        document.getElementById('field-id').value = '';
        if (selectTipo) {
            selectTipo.value = 'Procedimento';
        }
        document.getElementById('update-observation-wrap').style.display = 'none';
        document.getElementById('btn-delete-project').style.display = 'none';
        
        // Hide tabs
        document.getElementById('process-dialog-tabs').style.display = 'none';
    }
    showOverlay();
    document.getElementById('process-editor-dialog').show();
}
window.openEditor = openEditor;

function openSectorEditor(oldName) {
    var form = document.getElementById('sector-form');
    form.reset();
    var titleEl = document.querySelector('#sector-dialog h2');
    var btnSubmit = form.querySelector('button[type="submit"]');
    
    if (oldName) {
        titleEl.textContent = 'Editar Setor';
        btnSubmit.textContent = 'Salvar';
        document.getElementById('field-sector-old-name').value = oldName;
        document.getElementById('field-sector-name').value = oldName;
    } else {
        titleEl.textContent = 'Novo Setor';
        btnSubmit.textContent = 'Registar';
        document.getElementById('field-sector-old-name').value = '';
        document.getElementById('field-sector-name').value = '';
    }
    showOverlay();
    document.getElementById('sector-dialog').show();
}
window.openSectorEditor = openSectorEditor;

function openUserEditor(id) {
    var form = document.getElementById('user-form');
    form.reset();
    var selBase = document.getElementById('field-user-setor-base');
    selBase.innerHTML = appStore.state.sectors.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
    var cbGrid = document.getElementById('field-user-setores-visiveis');
    cbGrid.innerHTML = '<label class="checkbox-item"><input type="checkbox" value="__ALL__"> Todos</label>' +
        appStore.state.sectors.map(function (s) { return '<label class="checkbox-item"><input type="checkbox" value="' + s + '"> ' + s + '</label>'; }).join('');
    if (id) {
        document.getElementById('user-dialog-title').textContent = 'Editar Utilizador';
        var u = appStore.state.users.find(function (x) { return x.id === id; });
        if (!u) return;
        document.getElementById('field-user-id').value = u.id;
        document.getElementById('field-user-nome').value = u.nome;
        document.getElementById('field-user-login').value = u.login;
        document.getElementById('field-user-pass').value = u.senha;
        document.getElementById('field-user-nivel').value = u.nivelAcesso;
        selBase.value = u.setorBase;
        (u.setoresVisiveis || []).forEach(function (sv) {
            var cb = cbGrid.querySelector('input[value="' + sv + '"]');
            if (cb) cb.checked = true;
        });
    } else {
        document.getElementById('user-dialog-title').textContent = 'Novo Utilizador';
        document.getElementById('field-user-id').value = '';
    }
    showOverlay();
    document.getElementById('user-dialog').show();
}
window.openUserEditor = openUserEditor;

function openStatusEditor(id) {
    var form = document.getElementById('status-form');
    form.reset();
    var titleEl = document.querySelector('#status-dialog h2');
    
    if (id) {
        titleEl.textContent = 'Editar Status';
        var s = appStore.state.statuses.find(function (x) { return x.id === id; });
        if (!s) return;
        document.getElementById('field-status-id').value = s.id;
        document.getElementById('field-status-name').value = s.nome;
        document.getElementById('field-status-percentage').value = s.percentagem;
    } else {
        titleEl.textContent = 'Novo Status';
        document.getElementById('field-status-id').value = '';
        document.getElementById('field-status-name').value = '';
        document.getElementById('field-status-percentage').value = '';
    }
    showOverlay();
    document.getElementById('status-dialog').show();
}
window.openStatusEditor = openStatusEditor;

// =========================================================================
// INIT
// =========================================================================
document.addEventListener('DOMContentLoaded', function () {
    var loginScreen = document.getElementById('screen-login');
    var appScreen = document.getElementById('screen-app');
    var loginErr = document.getElementById('login-error');
    var firestoreReady = false;
    var pendingLogin = false;

    function enterApp(user) {
        loginScreen.style.display = 'none';
        appScreen.style.display = 'flex';
        document.getElementById('session-name').textContent = user.nome;
        document.getElementById('session-role').textContent = user.nivelAcesso;
        var adminLink = document.querySelector('.nav-admin-only');
        if (adminLink) adminLink.style.display = user.nivelAcesso === 'Admin' ? 'flex' : 'none';
        
        var btnNewProcess = document.getElementById('btn-new-process');
        if (btnNewProcess) btnNewProcess.style.display = AuthManager.canCreateOrEdit() ? 'inline-flex' : 'none';
        
        window.appStore.notify();
    }

    // Listen for authentication state changes (Anonymous Auth to unlock Firestore)
    var authInitiated = false;
    firebase.auth().onAuthStateChanged(function (firebaseUser) {
        if (firebaseUser) {
            // Unlocked! Start realtime listeners
            authInitiated = true;
            appStore.initRealtime();
        } else {
            // Sign in anonymously to bypass security rules
            firebase.auth().signInAnonymously().catch(function (error) {
                console.warn("Erro ao autenticar anonimamente, tentando iniciar banco mesmo assim:", error);
                if (!authInitiated) {
                    authInitiated = true;
                    appStore.initRealtime();
                }
            });
        }
    });

    // Listen for when users are loaded
    appStore.subscribe(function (state) {
        if (state.users.length > 0 && !firestoreReady) {
            firestoreReady = true;
            // Auto-login from session
            var existing = AuthManager.getSession();
            if (existing) enterApp(existing);
        }
    });

    function doLogin() {
        var u = document.getElementById('login-user').value.trim();
        var p = document.getElementById('login-pass').value;
        
        var session = AuthManager.login(u, p);
        if (!session) {
            loginErr.textContent = 'Utilizador ou senha incorretos.';
            return;
        }
        enterApp(session);
    }

    // Login form
    document.getElementById('login-form').addEventListener('submit', function (e) {
        e.preventDefault();
        loginErr.textContent = '';
        if (!firestoreReady) {
            loginErr.textContent = 'Conectando ao servidor...';
            return;
        }
        doLogin();
    });

    // Logout
    document.getElementById('btn-logout').addEventListener('click', function () {
        AuthManager.logout();
        appScreen.style.display = 'none';
        loginScreen.style.display = 'flex';
        loginErr.textContent = '';
    });

    // Views
    new DashboardView();
    new KanbanView();
    new AdminView();
    new InconformidadesView();
    new ReprovadosView();

    // Nav
    document.querySelectorAll('.nav-link').forEach(function (link) {
        link.addEventListener('click', function (e) {
            e.preventDefault();
            if (link.dataset.view === 'admin' && !AuthManager.isAdmin()) return;
            document.querySelectorAll('.nav-link').forEach(function (n) { n.classList.remove('active'); });
            link.classList.add('active');
            document.querySelectorAll('.view-section').forEach(function (s) { s.classList.remove('active'); });
            document.getElementById('view-' + link.dataset.view).classList.add('active');
        });
    });

    // Close buttons
    document.querySelectorAll('[data-close-dialog]').forEach(function (b) { b.addEventListener('click', closeAll); });
    document.getElementById('btn-close-offcanvas').addEventListener('click', closeAll);
    document.getElementById('global-modal-overlay').addEventListener('click', closeAll);

    // Process form
    document.getElementById('process-form').addEventListener('submit', function (e) {
        e.preventDefault();
        appStore.saveProject({
            id: document.getElementById('field-id').value || undefined,
            projeto: document.getElementById('field-projeto').value,
            setor: document.getElementById('field-setor').value,
            statusAtual: document.getElementById('field-status').value,
            tipo: document.getElementById('field-tipo').value,
            dataInicio: document.getElementById('field-data-inicio').value,
            dataFimPrevista: document.getElementById('field-data-fim-prevista').value,
            dataFimReal: document.getElementById('field-data-fim-real').value || null
        }, document.getElementById('field-observacao').value);
        closeAll();
    });

    // Delete project
    document.getElementById('btn-delete-project').addEventListener('click', function () {
        if (!AuthManager.canDelete()) {
            alert('Acesso negado: Você não tem permissão para excluir projetos.');
            return;
        }
        var id = document.getElementById('field-id').value;
        if (!id) return;
        var p = appStore.getProjectById(id);
        if (!p) return;
        if (confirm('Tem certeza que deseja excluir o projeto "' + p.projeto + '"? Esta ação não pode ser desfeita.')) {
            appStore.deleteProject(id);
            closeAll();
        }
    });

    // Sector form
    document.getElementById('sector-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var oldName = document.getElementById('field-sector-old-name').value;
        var newName = document.getElementById('field-sector-name').value.trim();
        if (!newName) return;
        
        if (oldName) {
            if (newName !== oldName && appStore.state.sectors.includes(newName)) {
                alert('Já existe um setor com o nome "' + newName + '".');
                return;
            }
            appStore.updateSector(oldName, newName);
        } else {
            if (appStore.state.sectors.includes(newName)) {
                alert('Já existe um setor com o nome "' + newName + '".');
                return;
            }
            appStore.addSector(newName);
        }
        closeAll();
    });

    // User form
    document.getElementById('user-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var checked = [];
        document.querySelectorAll('#field-user-setores-visiveis input:checked').forEach(function (c) { checked.push(c.value); });
        appStore.saveUser({
            id: document.getElementById('field-user-id').value || undefined,
            nome: document.getElementById('field-user-nome').value,
            login: document.getElementById('field-user-login').value,
            senha: document.getElementById('field-user-pass').value,
            nivelAcesso: document.getElementById('field-user-nivel').value,
            setorBase: document.getElementById('field-user-setor-base').value,
            setoresVisiveis: checked
        });
        closeAll();
    });

    // Buttons
    document.getElementById('btn-new-process').addEventListener('click', function () { openEditor(); });
    document.getElementById('btn-add-sector').addEventListener('click', function () {
        openSectorEditor();
    });
    document.getElementById('btn-add-user').addEventListener('click', function () { openUserEditor(); });
    document.getElementById('btn-add-status').addEventListener('click', function () { openStatusEditor(); });
    document.getElementById('btn-export-csv').addEventListener('click', function () {
        exportProjectsToCSV();
    });

    var btnExportGantt = document.getElementById('btn-export-gantt-excel');
    if (btnExportGantt) {
        btnExportGantt.addEventListener('click', function () {
            exportGanttToExcel();
        });
    }

    // Status form
    document.getElementById('status-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var name = document.getElementById('field-status-name').value.trim();
        var pct = parseFloat(document.getElementById('field-status-percentage').value);
        if (!name || isNaN(pct)) return;
        
        appStore.saveStatus({
            id: document.getElementById('field-status-id').value || undefined,
            nome: name,
            percentagem: pct
        });
        closeAll();
    });

    // Gantt date filters listeners
    var filterMonthEl = document.getElementById('gantt-filter-month');
    var filterStartEl = document.getElementById('gantt-filter-start');
    var filterEndEl = document.getElementById('gantt-filter-end');
    var btnClearDatesEl = document.getElementById('btn-gantt-clear-dates');

    function updateGanttFilters() {
        if (filterMonthEl && filterStartEl && filterEndEl) {
            appStore.setGanttDateFilters(
                filterMonthEl.value,
                filterStartEl.value,
                filterEndEl.value
            );
        }
    }

    if (filterMonthEl) filterMonthEl.addEventListener('change', updateGanttFilters);
    if (filterStartEl) filterStartEl.addEventListener('change', updateGanttFilters);
    if (filterEndEl) filterEndEl.addEventListener('change', updateGanttFilters);



    if (btnClearDatesEl) {
        btnClearDatesEl.addEventListener('click', function () {
            if (filterMonthEl) filterMonthEl.value = 'Todos';
            if (filterStartEl) filterStartEl.value = '';
            if (filterEndEl) filterEndEl.value = '';
            appStore.setGanttDateFilters('Todos', '', '');
        });
    }

    // =========================================================================
    // THEME TOGGLE (Dark / Light)
    // =========================================================================
    var THEME_KEY = 'gp_theme';

    function applyTheme(theme) {
        var root = document.documentElement;
        root.setAttribute('data-theme', theme);

        var themeIcon = document.getElementById('theme-icon');
        var themeLabel = document.getElementById('theme-label');

        if (themeIcon && themeLabel) {
            if (theme === 'dark') {
                themeIcon.textContent = 'light_mode';
                themeLabel.textContent = 'Tema Claro';
            } else {
                themeIcon.textContent = 'dark_mode';
                themeLabel.textContent = 'Tema Escuro';
            }
        }

        // Swap sidebar logos
        var darkLogos = document.querySelectorAll('.logo-dark');
        var lightLogos = document.querySelectorAll('.logo-light');
        darkLogos.forEach(function (el) { el.style.display = theme === 'dark' ? 'block' : 'none'; });
        lightLogos.forEach(function (el) { el.style.display = theme === 'light' ? 'block' : 'none'; });

        // Update login logo
        var loginLogo = document.querySelector('.login-logo');
        if (loginLogo) {
            loginLogo.src = 'Logo Branca.png'; // Always white on login (gradient bg)
        }

        localStorage.setItem(THEME_KEY, theme);
    }

    // Initialize theme from storage or default
    var savedTheme = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(savedTheme);

    // Toggle button
    var btnToggleTheme = document.getElementById('btn-toggle-theme');
    if (btnToggleTheme) {
        btnToggleTheme.addEventListener('click', function () {
            var currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
            var newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            applyTheme(newTheme);
        });
    }

    // Nova Inconformidade button
    var btnNewInc = document.getElementById('btn-new-inconformidade');
    if (btnNewInc) {
        btnNewInc.addEventListener('click', function () {
            openInconformidadeEditor();
        });
    }

    // Inconformidade Form Submit
    var incForm = document.getElementById('inconformidade-form');
    if (incForm) {
        incForm.addEventListener('submit', function (e) {
            e.preventDefault();
            
            var desc = document.getElementById('field-inc-descricao').value.trim();
            var sector = document.getElementById('field-inc-setor-origem').value;
            var status = document.getElementById('field-inc-status').value;
            var obs = document.getElementById('field-inc-observacao').value.trim();
            var newComment = document.getElementById('field-inc-new-comment').value.trim();
            var linkedProj = document.getElementById('field-inc-projeto-vinculado').value;
            
            var sectorsAffected = [];
            document.querySelectorAll('#field-inc-setores-afetados input:checked').forEach(function (c) {
                sectorsAffected.push(c.value);
            });
            
            if (!desc || !sector || !status) {
                alert('Por favor, preencha todos os campos obrigatórios.');
                return;
            }
            if (sectorsAffected.length === 0) {
                alert('Por favor, selecione ao menos um setor afetado.');
                return;
            }
            
            var payload = {
                id: document.getElementById('field-inc-id').value || undefined,
                descricao: desc,
                setor: sector, // maintain backward compatibility by saving origin sector under 'setor'
                status: status,
                observacao: obs,
                novaObservacao: newComment,
                projetoId: linkedProj || null,
                setoresAfetados: sectorsAffected
            };
            
            appStore.saveInconformidade(payload)
                .then(function () {
                    closeAll();
                })
                .catch(function (err) {
                    alert('Erro ao gravar não conformidade: ' + err.message);
                });
        });
    }

    // Delete Inconformidade button
    var btnDeleteInc = document.getElementById('btn-delete-inconformidade');
    if (btnDeleteInc) {
        btnDeleteInc.addEventListener('click', function () {
            var id = document.getElementById('field-inc-id').value;
            if (!id) return;
            var inc = appStore.state.inconformidades.find(function (x) { return x.id === id; });
            if (!inc) return;
            if (confirm('Tem certeza que deseja excluir esta inconformidade? Esta ação não pode ser desfeita.')) {
                appStore.deleteInconformidade(id)
                    .then(function () {
                        closeAll();
                    })
                    .catch(function (err) {
                        alert('Erro ao excluir: ' + err.message);
                    });
            }
        });
    }

    // Offcanvas Tabs
    var tabTimelineBtn = document.getElementById('tab-timeline-btn');
    var tabRevisionsBtn = document.getElementById('tab-revisions-btn');
    var tabTimelineContent = document.getElementById('offcanvas-tab-timeline');
    var tabRevisionsContent = document.getElementById('offcanvas-tab-revisions');

    if (tabTimelineBtn && tabRevisionsBtn && tabTimelineContent && tabRevisionsContent) {
        tabTimelineBtn.addEventListener('click', function() {
            tabTimelineBtn.classList.add('active');
            tabRevisionsBtn.classList.remove('active');
            tabTimelineContent.style.display = 'block';
            tabRevisionsContent.style.display = 'none';
        });
        tabRevisionsBtn.addEventListener('click', function() {
            tabRevisionsBtn.classList.add('active');
            tabTimelineBtn.classList.remove('active');
            tabRevisionsContent.style.display = 'block';
            tabTimelineContent.style.display = 'none';
        });
    }

    // Revision Form Submit
    var revForm = document.getElementById('offcanvas-revision-form');
    if (revForm) {
        revForm.addEventListener('submit', function(e) {
            e.preventDefault();
            var projectId = document.getElementById('revision-project-id').value;
            var dateVal = document.getElementById('revision-date').value;
            var commentVal = document.getElementById('revision-comment').value.trim();
            if (!projectId || !dateVal || !commentVal) return;
            
            appStore.saveRevision(projectId, {
                dataRevisao: dateVal,
                comentario: commentVal
            }).then(function() {
                openOffcanvas(projectId);
            }).catch(function(err) {
                alert('Erro ao salvar revisão: ' + err.message);
            });
        });
    }

    // Dialog Tabs (Process Editor Dialog)
    var tabDataBtn = document.getElementById('dialog-tab-data-btn');
    var tabDialogRevisionsBtn = document.getElementById('dialog-tab-revisions-btn');
    var tabDataContent = document.getElementById('dialog-tab-content-data');
    var tabDialogRevisionsContent = document.getElementById('dialog-tab-content-revisions');
    var dialogFooter = document.querySelector('#process-editor-dialog .dialog-footer');

    if (tabDataBtn && tabDialogRevisionsBtn) {
        tabDataBtn.addEventListener('click', function() {
            tabDataBtn.classList.add('active');
            tabDialogRevisionsBtn.classList.remove('active');
            tabDataContent.classList.add('active');
            tabDialogRevisionsContent.classList.remove('active');
            if (dialogFooter) dialogFooter.style.display = 'flex';
        });
        tabDialogRevisionsBtn.addEventListener('click', function() {
            tabDialogRevisionsBtn.classList.add('active');
            tabDataBtn.classList.remove('active');
            tabDialogRevisionsContent.classList.add('active');
            tabDataContent.classList.remove('active');
            if (dialogFooter) dialogFooter.style.display = 'none';
        });
    }

    // Dialog Register Revision Click
    var btnDialogRegRev = document.getElementById('btn-dialog-register-revision');
    if (btnDialogRegRev) {
        btnDialogRegRev.addEventListener('click', function() {
            var projectId = document.getElementById('field-id').value;
            var dateVal = document.getElementById('dialog-revision-date').value;
            var commentVal = document.getElementById('dialog-revision-comment').value.trim();
            if (!projectId || !dateVal || !commentVal) {
                alert('Por favor, preencha a data e o comentário da revisão.');
                return;
            }
            
            appStore.saveRevision(projectId, {
                dataRevisao: dateVal,
                comentario: commentVal
            }).then(function() {
                // Clean input
                document.getElementById('dialog-revision-comment').value = '';
                // Read project from store again and update revision log inside dialog
                var updatedProj = appStore.getProjectById(projectId);
                if (updatedProj) {
                    var listContainer = document.getElementById('dialog-revisions-list');
                    if (listContainer) {
                        var revs = (updatedProj.revisoes || []).slice().reverse();
                        listContainer.innerHTML = revs.map(function (r) {
                            return '<div class="revision-item">' +
                                   '  <div class="revision-header">' +
                                   '    <span><strong class="revision-user">' + r.usuarioNome + '</strong></span>' +
                                   '    <span>' + formatDate(r.dataRevisao) + '</span>' +
                                   '  </div>' +
                                   '  <div class="revision-comment">' + r.comentario + '</div>' +
                                   '</div>';
                        }).join('') || '<p style="color:var(--text-muted);font-size:0.75rem;">Nenhuma revisão registrada.</p>';
                    }
                }
            }).catch(function(err) {
                alert('Erro ao registrar revisão: ' + err.message);
            });
        });
    }
});

function exportProjectsToCSV() {
    var projects = AuthManager.filterByPermission(appStore.state.projects);
    if (!projects || projects.length === 0) {
        alert("Nenhum processo disponível para exportação.");
        return;
    }

    var headers = [
        "ID",
        "Nome do Projeto",
        "Setor",
        "Tipo",
        "Status Atual",
        "% Conclusão",
        "Dias Restantes/Atraso",
        "Data de Início",
        "Data de Fim Prevista",
        "Data de Fim Real",
        "Histórico de Alterações"
    ];

    var rows = [headers];

    projects.forEach(function (p) {
        var historyText = (p.historicoAtualizacoes || []).map(function (h) {
            var dateStr;
            try {
                dateStr = new Date(h.dataAlteracao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
            } catch (e) {
                dateStr = h.dataAlteracao;
            }
            return "[" + dateStr + "] " + h.statusAnterior + " -> " + h.statusNovo + " (" + (h.observacao || "") + ")";
        }).join(" | ");

        var percent = appStore.getStatusPercentage(p.statusAtual);
        var days = p.diasParaConclusaoPrevista === null ? "Sem previsão" : (p.diasParaConclusaoPrevista < 0 ? Math.abs(p.diasParaConclusaoPrevista) + " dias atrasado" : p.diasParaConclusaoPrevista + " dias restantes");

        var row = [
            p.id || "",
            p.projeto || "",
            p.setor || "",
            p.tipo || "Procedimento",
            p.statusAtual || "",
            percent + "%",
            days,
            p.dataInicio ? formatDate(p.dataInicio) : "",
            p.dataFimPrevista ? formatDate(p.dataFimPrevista) : "",
            p.dataFimReal ? formatDate(p.dataFimReal) : "",
            historyText
        ];

        rows.push(row);
    });

    var csvContent = "\uFEFF" + rows.map(function (row) {
        return row.map(function (field) {
            var val = String(field).replace(/"/g, '""');
            return '"' + val + '"';
        }).join(";");
    }).join("\r\n");

    var blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    var link = document.createElement("a");
    var url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "relatorio_processos_" + new Date().toISOString().slice(0,10) + ".csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
window.exportProjectsToCSV = exportProjectsToCSV;

function exportGanttToExcel() {
    var state = appStore.state;
    var visible = AuthManager.filterByPermission(state.projects);
    var visSectors = AuthManager.visibleSectors();
    
    var validProjects = visible.filter(function (p) {
        return p.dataInicio && p.dataFimPrevista;
    });

    if (validProjects.length === 0) {
        alert("Nenhum projeto com cronograma definido (Data Início e Fim Prevista) para exportar.");
        return;
    }

    // Calculate overall minDate and maxDate
    var minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    minDate.setDate(minDate.getDate() - 1);

    var maxDate = new Date();
    maxDate.setHours(0, 0, 0, 0);
    maxDate.setDate(maxDate.getDate() + 30);

    validProjects.forEach(function (p) {
        var end = new Date((p.dataFimReal || p.dataFimPrevista) + 'T00:00:00');
        if (end > maxDate) maxDate = end;
    });
    maxDate.setDate(maxDate.getDate() + 7);

    var totalTime = maxDate - minDate;
    if (totalTime <= 0) totalTime = 30 * 864e5;
    var totalDays = Math.ceil(totalTime / 864e5);

    // Build the sheet data
    if (typeof XLSX === 'undefined') {
        alert("Erro: Biblioteca de exportação Excel não carregada.");
        return;
    }

    var wb = XLSX.utils.book_new();

    visSectors.forEach(function (sector) {
        var ws_data = [];
        
        // Add header
        ws_data.push(["AgroTech Bioenergia S.A. - Cronograma Gantt - Setor: " + sector]);
        ws_data.push([]); // blank line
        
        // Build timeline headers
        var headers = ["Projeto", "Tipo", "Status", "% Conclusão", "Início", "Fim Previsto", "Fim Real", "Dias Restantes"];
        var dates = [];
        for (var d = 0; d <= totalDays; d++) {
            var tickDate = new Date(minDate.getTime() + (d * 864e5));
            var formattedDate = tickDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
            headers.push(formattedDate);
            dates.push(tickDate);
        }
        ws_data.push(headers);

        var sectorProjects = validProjects.filter(function (p) { return p.setor === sector; });
        if (sectorProjects.length === 0) {
            ws_data.push(["Sem projetos para este setor"]);
        } else {
            sectorProjects.forEach(function (p) {
                var progress = p.percentagemConclusao || 0;
                var pStart = new Date(p.dataInicio + 'T00:00:00');
                var pEnd = new Date(p.dataFimPrevista + 'T00:00:00');
                var pReal = p.dataFimReal ? new Date(p.dataFimReal + 'T00:00:00') : null;
                var late = p.diasParaConclusaoPrevista !== null && p.diasParaConclusaoPrevista < 0;
                var daysRemaining = p.diasParaConclusaoPrevista === null ? "Sem previsão" : (late ? Math.abs(p.diasParaConclusaoPrevista) + " dias atrasado" : p.diasParaConclusaoPrevista + " dias restantes");

                var row = [
                    p.projeto || "",
                    p.tipo || "Procedimento",
                    p.statusAtual || "",
                    progress + "%",
                    formatDate(p.dataInicio),
                    formatDate(p.dataFimPrevista),
                    p.dataFimReal ? formatDate(p.dataFimReal) : "",
                    daysRemaining
                ];

                dates.forEach(function (dDate) {
                    var startVal = pStart.getTime();
                    var endVal = (pReal || pEnd).getTime();
                    var currentVal = dDate.getTime();
                    if (currentVal >= startVal && currentVal <= endVal) {
                        row.push("■");
                    } else {
                        row.push("");
                    }
                });

                ws_data.push(row);
            });
        }

        var ws = XLSX.utils.aoa_to_sheet(ws_data);
        
        // Append to workbook
        XLSX.utils.book_append_sheet(wb, ws, sector.substring(0, 31));
    });

    // Write file
    XLSX.writeFile(wb, "cronograma_gantt_setores_" + new Date().toISOString().slice(0,10) + ".xlsx");
}
window.exportGanttToExcel = exportGanttToExcel;

// =========================================================================
// GANTT VIEW
// =========================================================================
function GanttView() {
    appStore.subscribe(this.render.bind(this));
}
GanttView.prototype.render = function (state) {
    var container = document.getElementById('gantt-chart-container');
    if (!container) return;

    // Sync input filter fields with state values
    var selectMonth = document.getElementById('gantt-filter-month');
    var inputStart = document.getElementById('gantt-filter-start');
    var inputEnd = document.getElementById('gantt-filter-end');
    
    if (selectMonth) selectMonth.value = state.ganttFilterMonth || 'Todos';
    if (inputStart) inputStart.value = state.ganttFilterStart || '';
    if (inputEnd) inputEnd.value = state.ganttFilterEnd || '';

    var visible = AuthManager.filterByPermission(state.projects);
    var visSectors = AuthManager.visibleSectors();
    this._tabs(state.ganttFilter, visSectors);
    
    var filtered = state.ganttFilter === 'Todos' ? visible : visible.filter(function (p) { return p.setor === state.ganttFilter; });
    var validProjects = filtered.filter(function (p) {
        return p.dataInicio && p.dataFimPrevista;
    });

    // Apply month filter
    if (state.ganttFilterMonth && state.ganttFilterMonth !== 'Todos') {
        var targetMonth = parseInt(state.ganttFilterMonth, 10);
        validProjects = validProjects.filter(function (p) {
            var start = new Date(p.dataInicio + 'T00:00:00');
            var end = new Date((p.dataFimReal || p.dataFimPrevista) + 'T00:00:00');
            var startMonth = start.getMonth() + 1;
            var endMonth = end.getMonth() + 1;
            return startMonth === targetMonth || endMonth === targetMonth || (startMonth < targetMonth && endMonth > targetMonth);
        });
    }

    // Apply date range filters
    if (state.ganttFilterStart) {
        var startFilter = new Date(state.ganttFilterStart + 'T00:00:00');
        validProjects = validProjects.filter(function (p) {
            var pEnd = new Date((p.dataFimReal || p.dataFimPrevista) + 'T00:00:00');
            return pEnd >= startFilter;
        });
    }
    if (state.ganttFilterEnd) {
        var endFilter = new Date(state.ganttFilterEnd + 'T00:00:00');
        validProjects = validProjects.filter(function (p) {
            var pStart = new Date(p.dataInicio + 'T00:00:00');
            return pStart <= endFilter;
        });
    }

    if (validProjects.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;padding:2rem;">Nenhum projeto com cronograma definido (Data Início e Fim Prevista) para os filtros selecionados.</p>';
        return;
    }

    // Lock minDate to today onwards (with a small 1 day padding)
    var minDate = new Date();
    minDate.setHours(0, 0, 0, 0);
    minDate.setDate(minDate.getDate() - 1);

    var maxDate = new Date();
    maxDate.setHours(0, 0, 0, 0);
    maxDate.setDate(maxDate.getDate() + 30); // at least 30 days window from today

    validProjects.forEach(function (p) {
        var end = new Date((p.dataFimReal || p.dataFimPrevista) + 'T00:00:00');
        if (end > maxDate) maxDate = end;
    });

    maxDate.setDate(maxDate.getDate() + 7); // 7 days padding

    var totalTime = maxDate - minDate;
    if (totalTime <= 0) totalTime = 30 * 864e5;

    var totalDays = Math.ceil(totalTime / 864e5);
    if (totalDays <= 0) totalDays = 30;

    var timelineWidth = Math.max(800, totalDays * 25);
    var timelineColStyle = 'style="width: ' + timelineWidth + 'px; min-width: ' + timelineWidth + 'px; flex: 0 0 ' + timelineWidth + 'px;"';

    // Generate background day grid lines
    var gridLinesHtml = '<div class="gantt-grid-lines">';
    for (var d = 0; d <= totalDays; d++) {
        var leftPercent = (d / totalDays) * 100;
        gridLinesHtml += '<div class="gantt-grid-line" style="left: ' + leftPercent + '%;"></div>';
    }
    gridLinesHtml += '</div>';

    var ticksHtml = '';
    var tickInterval = 7;
    if (totalDays > 60) {
        tickInterval = 14;
    }
    if (totalDays > 180) {
        tickInterval = 30;
    }
    var tickCount = Math.floor(totalDays / tickInterval);
    for (var i = 0; i <= tickCount; i++) {
        var tickDays = i * tickInterval;
        var tickDate = new Date(minDate.getTime() + (tickDays * 864e5));
        var leftPercent = (tickDays / totalDays) * 100;
        var formatted = tickDate.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }) + ' ' + tickDate.getFullYear();
        ticksHtml += '<div class="gantt-header-tick" style="left: ' + leftPercent + '%;">' + formatted + '</div>';
    }

    var session = AuthManager.getSession();

    var rowsHtml = validProjects.map(function (p) {
        var pStart = new Date(p.dataInicio + 'T00:00:00');
        var pEnd = new Date(p.dataFimPrevista + 'T00:00:00');
        var pReal = p.dataFimReal ? new Date(p.dataFimReal + 'T00:00:00') : null;
        
        var startMs = pStart - minDate;
        var endMs = (pReal || pEnd) - minDate;
        
        var leftPercent = (startMs / totalTime) * 100;
        var widthPercent = (endMs - startMs) / totalTime * 100;
        
        // Handle offset scaling if starting before minDate (today)
        if (endMs <= 0) {
            leftPercent = 0;
            widthPercent = 0;
        } else if (startMs < 0) {
            leftPercent = 0;
            widthPercent = (endMs / totalTime) * 100;
        }
        
        if (widthPercent < 0) widthPercent = 0;
        if (leftPercent + widthPercent > 100) widthPercent = 100 - leftPercent;
        
        var progress = p.percentagemConclusao || 0;
        var late = p.diasParaConclusaoPrevista !== null && p.diasParaConclusaoPrevista < 0;
        
        var barColor = 'var(--accent-primary)';
        if (progress === 100) {
            barColor = 'var(--color-success)';
        } else if (late) {
            barColor = 'var(--color-danger)';
        }
        
        var canEdit = session && (session.nivelAcesso === 'Admin' || p.setor === session.setorBase);
        var cursorStyle = canEdit ? 'grab' : 'help';

        var tooltip = 'Projeto: ' + p.projeto + '\n' +
                      'Setor: ' + p.setor + '\n' +
                      'Tipo: ' + (p.tipo || 'Procedimento') + '\n' +
                      'Status: ' + p.statusAtual + ' (' + progress + '%)\n' +
                      'Início: ' + formatDate(p.dataInicio) + '\n' +
                      'Fim Previsto: ' + formatDate(p.dataFimPrevista) + '\n' +
                      (p.dataFimReal ? 'Fim Real: ' + formatDate(p.dataFimReal) + '\n' : '') +
                      (p.diasParaConclusaoPrevista !== null ? (late ? 'Atrasado: ' + Math.abs(p.diasParaConclusaoPrevista) + ' dias' : 'Restam: ' + p.diasParaConclusaoPrevista + ' dias') : '') +
                      (canEdit ? '\n(Arraste a barra para alterar as datas)' : '');
        
        return '<div class="gantt-row" title="' + tooltip.replace(/"/g, '&quot;') + '">' +
               '  <div class="gantt-info-col" style="cursor: pointer;" onclick="openOffcanvas(\'' + p.id + '\')">' +
               '    <div class="gantt-project-name">' + p.projeto + '</div>' +
               '    <div class="gantt-project-meta">' + p.setor + ' &middot; ' + (p.tipo || 'Procedimento') + ' &middot; ' + p.statusAtual + '</div>' +
               '  </div>' +
               '  <div class="gantt-timeline-col" ' + timelineColStyle + '>' +
               '    <div class="gantt-timeline-track">' +
               gridLinesHtml +
               '      <div class="gantt-bar-fill" style="left: ' + leftPercent + '%; width: ' + widthPercent + '%; background-color: ' + barColor + '; cursor: ' + cursorStyle + ';" data-id="' + p.id + '">' +
               '        <div class="gantt-bar-progress-overlay" style="width: ' + progress + '%;"></div>' +
               '        <span class="gantt-bar-label">' + progress + '%</span>' +
               '      </div>' +
               '    </div>' +
               '  </div>' +
               '</div>';
    }).join('');

    container.innerHTML = 
        '<div class="gantt-chart">' +
        '  <div class="gantt-header">' +
        '    <div class="gantt-info-col">Projeto</div>' +
        '    <div class="gantt-timeline-col" ' + timelineColStyle + '>' +
        '      <div class="gantt-header-ticks">' + ticksHtml + '</div>' +
        '    </div>' +
        '  </div>' +
        '  <div class="gantt-body">' + rowsHtml + '</div>' +
        '</div>';

    // Drag-to-scroll (pan) on empty chart container area
    var scrollContainer = container.parentElement;
    if (scrollContainer) {
        var isPanning = false;
        var panStartX = 0;
        var startScrollLeft = 0;
        
        scrollContainer.addEventListener('mousedown', function (e) {
            if (e.target.closest('.gantt-bar-fill') || e.target.closest('.gantt-info-col') || e.target.closest('.tab') || e.target.closest('select') || e.target.closest('input') || e.target.closest('button')) {
                return;
            }
            isPanning = true;
            scrollContainer.classList.add('grabbing');
            panStartX = e.clientX;
            startScrollLeft = scrollContainer.scrollLeft;
            scrollContainer.style.cursor = 'grabbing';
        });
        
        document.addEventListener('mousemove', function (e) {
            if (!isPanning) return;
            var dx = e.clientX - panStartX;
            scrollContainer.scrollLeft = startScrollLeft - dx;
        });
        
        document.addEventListener('mouseup', function () {
            if (!isPanning) return;
            isPanning = false;
            scrollContainer.style.cursor = 'grab';
            scrollContainer.classList.remove('grabbing');
        });
    }

    // Drag-and-drop bindings and click-to-open logic
    container.querySelectorAll('.gantt-bar-fill').forEach(function (bar) {
        var projectId = bar.dataset.id;
        var p = appStore.getProjectById(projectId);
        if (!p) return;
        
        var canEdit = session && (session.nivelAcesso === 'Admin' || p.setor === session.setorBase);

        bar.addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();

            var startX = e.clientX;
            var barLeft = parseFloat(bar.style.left);
            var track = bar.parentElement;
            var trackWidth = track.getBoundingClientRect().width;
            
            bar.style.cursor = 'grabbing';
            bar.classList.add('dragging');
            
            var deltaDays = 0;
            var hasDragged = false;
            
            function onMouseMove(moveEvent) {
                var deltaX = moveEvent.clientX - startX;
                if (Math.abs(deltaX) > 3) {
                    hasDragged = true;
                }
                var deltaPercent = (deltaX / trackWidth) * 100;
                var newLeftPercent = barLeft + deltaPercent;
                
                var widthPercent = parseFloat(bar.style.width);
                if (newLeftPercent < 0) newLeftPercent = 0;
                if (newLeftPercent + widthPercent > 100) newLeftPercent = 100 - widthPercent;
                
                bar.style.left = newLeftPercent + '%';
                
                var shiftMs = (deltaPercent / 100) * totalTime;
                deltaDays = Math.round(shiftMs / 864e5);
            }
            
            function onMouseUp(upEvent) {
                document.removeEventListener('mousemove', onMouseMove);
                document.removeEventListener('mouseup', onMouseUp);
                
                bar.style.cursor = canEdit ? 'grab' : 'help';
                bar.classList.remove('dragging');
                
                if (!hasDragged) {
                    // Click instead of drag! Open project details offcanvas
                    openOffcanvas(p.id);
                } else if (canEdit && deltaDays !== 0) {
                    var newStart = new Date(new Date(p.dataInicio + 'T00:00:00').getTime() + deltaDays * 864e5);
                    var newEnd = new Date(new Date(p.dataFimPrevista + 'T00:00:00').getTime() + deltaDays * 864e5);
                    
                    var formatDateISO = function (d) {
                        var y = d.getFullYear();
                        var m = String(d.getMonth() + 1).padStart(2, '0');
                        var day = String(d.getDate()).padStart(2, '0');
                        return y + '-' + m + '-' + day;
                    };
                    
                    var updatedData = {
                        id: p.id,
                        projeto: p.projeto,
                        setor: p.setor,
                        statusAtual: p.statusAtual,
                        tipo: p.tipo || 'Procedimento',
                        dataInicio: formatDateISO(newStart),
                        dataFimPrevista: formatDateISO(newEnd)
                    };
                    
                    if (p.dataFimReal) {
                        var newReal = new Date(new Date(p.dataFimReal + 'T00:00:00').getTime() + deltaDays * 864e5);
                        updatedData.dataFimReal = formatDateISO(newReal);
                    }
                    
                    appStore.saveProject(updatedData, 'Deslocamento de datas via gráfico Gantt (' + (deltaDays > 0 ? '+' : '') + deltaDays + ' dias).')
                        .then(function () {
                            console.log('Projeto atualizado via Gantt drag:', p.projeto);
                        })
                        .catch(function (err) {
                            alert('Erro ao atualizar datas: ' + err.message);
                            appStore.notify();
                        });
                } else {
                    appStore.notify();
                }
            }
            
            document.addEventListener('mousemove', onMouseMove);
            document.addEventListener('mouseup', onMouseUp);
        });
    });
};
GanttView.prototype._tabs = function (cur, sectors) {
    var el = document.getElementById('gantt-sector-tabs');
    if (!el) return;
    var all = ['Todos'].concat(sectors);
    el.innerHTML = all.map(function (s) {
        return '<button class="tab ' + (cur === s ? 'active' : '') + '" data-gsf="' + s + '">' + s + '</button>';
    }).join('');
    el.querySelectorAll('.tab').forEach(function (b) {
        b.onclick = function () { appStore.setGanttFilter(b.dataset.gsf); };
    });
};

new GanttView();

// =========================================================================
// REPROVADOS VIEW
// =========================================================================
function ReprovadosView() {
    appStore.subscribe(this.render.bind(this));
}

ReprovadosView.prototype.render = function (state) {
    var visible = AuthManager.filterByPermission(state.projects);
    var vis = AuthManager.visibleSectors();
    var curFilter = state.reprovadosFilter || 'Todos';

    this._filters(curFilter, vis);

    var reprovados = visible.filter(function (p) {
        return p.statusAtual === 'Reprovado';
    });

    var filtered = curFilter === 'Todos' ? reprovados : reprovados.filter(function (p) { return p.setor === curFilter; });

    filtered.sort(function (a, b) {
        if (a.dataFimPrevista && b.dataFimPrevista) {
            return b.dataFimPrevista.localeCompare(a.dataFimPrevista);
        }
        return 0;
    });

    var countEl = document.getElementById('reprovados-count');
    if (countEl) countEl.textContent = reprovados.length;

    var cont = document.getElementById('reprovados-container');
    if (!cont) return;

    if (filtered.length === 0) {
        cont.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:3rem 1rem;color:var(--text-muted);background:var(--card-bg);border:1px dashed var(--border-color);border-radius:var(--radius-lg);">' +
            '<span class="material-symbols-rounded" style="font-size:3rem;margin-bottom:0.5rem;color:var(--text-muted)">check_circle</span>' +
            '<p style="font-size:0.95rem;font-weight:500;">Nenhum processo reprovado no filtro selecionado.</p>' +
            '</div>';
        return;
    }

    cont.innerHTML = filtered.map(this._card).join('');
    cont.querySelectorAll('.kanban-card').forEach(function (c) {
        c.onclick = function () { openOffcanvas(c.dataset.id); };
    });
};

ReprovadosView.prototype._filters = function (cur, sectors) {
    var el = document.getElementById('reprovados-sector-tabs');
    if (!el) return;
    el.innerHTML = ['Todos'].concat(sectors).map(function (s) {
        return '<button class="tab ' + (cur === s ? 'active' : '') + '" data-rsf="' + s + '">' + s + '</button>';
    }).join('');
    el.querySelectorAll('.tab').forEach(function (b) {
        b.onclick = function () { appStore.setReprovadosFilter(b.dataset.rsf); };
    });
};

ReprovadosView.prototype._card = function (p) {
    var prev = formatDate(p.dataFimPrevista);
    
    var editBtnHtml = '';
    var session = AuthManager.getSession();
    if (session && AuthManager.canCreateOrEdit() && (session.nivelAcesso === 'Admin' || p.setor === session.setorBase)) {
        editBtnHtml = '<button class="btn btn-sm btn-outline" title="Editar / Reativar" onclick="event.stopPropagation();openEditor(\'' + p.id + '\')" style="display:flex;align-items:center;justify-content:center;gap:0.25rem"><span class="material-symbols-rounded" style="font-size:1.1em">edit</span> Reativar / Editar</button>';
    }

    var tipoClass = 'badge-procedimento';
    if (p.tipo === 'Política' || p.tipo === 'Política') tipoClass = 'badge-politica';
    else if (p.tipo === 'Manual') tipoClass = 'badge-manual';
    else if (p.tipo === 'Formulário' || p.tipo === 'Formulário') tipoClass = 'badge-formulario';
    var tipoBadge = '<span class="badge-tipo ' + tipoClass + '">' + (p.tipo || 'Procedimento') + '</span>';
    
    var lastObs = 'Sem justificativa registrada.';
    if (p.historicoAtualizacoes && p.historicoAtualizacoes.length > 0) {
        var last = p.historicoAtualizacoes[p.historicoAtualizacoes.length - 1];
        if (last && last.observacao) lastObs = last.observacao;
    }

    return '<div class="kanban-card reprovado" data-id="' + p.id + '">' +
        '  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:0.4rem;">' +
        '    <span class="kc-sector">' + p.setor + '</span>' +
        '    <span class="badge badge-reprovado" style="display:flex;align-items:center;gap:0.2rem;"><span class="material-symbols-rounded" style="font-size:1rem;">cancel</span> REPROVADO</span>' +
        '  </div>' +
        '  <h3 class="kc-title">' + p.projeto + '</h3>' +
        '  <div style="margin-bottom:0.75rem;">' + tipoBadge + '</div>' +
        '  <div style="background:rgba(248,113,113,0.06);border:1px solid rgba(248,113,113,0.15);padding:0.6rem 0.75rem;border-radius:var(--radius-md);font-size:0.78rem;color:var(--text-secondary);margin-bottom:0.85rem;">' +
        '    <strong style="color:var(--color-danger);display:block;margin-bottom:0.2rem;">Justificativa / Observação:</strong> ' + lastObs +
        '  </div>' +
        '  <div style="display:flex;justify-content:space-between;align-items:center;font-size:0.75rem;color:var(--text-muted);margin-bottom:0.75rem;">' +
        '    <span>Fim Previsto: ' + prev + '</span>' +
        '  </div>' +
        '  <div class="kc-footer">' +
        '    <span class="kc-days danger" style="display:flex;align-items:center;gap:0.25rem;"><span class="material-symbols-rounded" style="font-size:1.1rem;">block</span> Reprovado</span>' +
        '    ' + editBtnHtml +
        '  </div>' +
        '</div>';
};

// =========================================================================
// INCONFORMIDADES VIEW
// =========================================================================
function InconformidadesView() {
    appStore.subscribe(this.render.bind(this));
    this.currentSectorFilter = 'Todos';
    this.currentStageFilter = 'Todos';
}

InconformidadesView.prototype.render = function (state) {
    var all = AuthManager.filterByPermission(state.inconformidades || []);
    var visSectors = AuthManager.visibleSectors();
    
    this._tabs(this.currentSectorFilter, visSectors);
    this._stageTabs(this.currentStageFilter);
    
    var self = this;
    var filtered = self.currentSectorFilter === 'Todos' ? all : all.filter(function (x) {
        var sector = x.setor || x.setor_registrou;
        return sector === self.currentSectorFilter || (x.setoresAfetados && x.setoresAfetados.indexOf(self.currentSectorFilter) !== -1);
    });
    
    var total = filtered.length;
    var analise = filtered.filter(function (x) { return (x.status || 'Em análise') === 'Em análise'; }).length;
    var andamento = filtered.filter(function (x) { return x.status === 'Em andamento'; }).length;
    var tratadas = filtered.filter(function (x) { return x.status === 'Finalizado'; }).length;
    
    var analisePct = total > 0 ? ((analise / total) * 100).toFixed(1) : '0.0';
    var andamentoPct = total > 0 ? ((andamento / total) * 100).toFixed(1) : '0.0';
    var tratadasPct = total > 0 ? ((tratadas / total) * 100).toFixed(1) : '0.0';
    
    var elTotal = document.getElementById('kpi-inc-total');
    var elAnalise = document.getElementById('kpi-inc-analise');
    var elAndamento = document.getElementById('kpi-inc-andamento');
    var elTratadas = document.getElementById('kpi-inc-tratadas');
    
    if (elTotal) elTotal.textContent = total;
    if (elAnalise) elAnalise.innerHTML = analise + ' <span class="kpi-percent">(' + analisePct + '%)</span>';
    if (elAndamento) elAndamento.innerHTML = andamento + ' <span class="kpi-percent">(' + andamentoPct + '%)</span>';
    if (elTratadas) elTratadas.innerHTML = tratadas + ' <span class="kpi-percent">(' + tratadasPct + '%)</span>';
    
    var container = document.getElementById('inconformidades-container');
    if (!container) return;
    
    var stageFiltered = self.currentStageFilter === 'Todos' ? filtered : filtered.filter(function (x) { return (x.status || 'Em análise') === self.currentStageFilter; });
    
    if (stageFiltered.length === 0) {
        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.85rem;text-align:center;grid-column:1/-1;padding:2rem;">Nenhuma inconformidade registrada para os filtros selecionados.</p>';
        return;
    }
    
    container.innerHTML = stageFiltered.map(this._card).join('');
    
    container.querySelectorAll('.kanban-card').forEach(function (c) {
        c.onclick = function () { openInconformidadeEditor(c.dataset.id); };
    });
};

InconformidadesView.prototype._tabs = function (cur, sectors) {
    var el = document.getElementById('inconformidades-sector-tabs');
    if (!el) return;
    var all = ['Todos'].concat(sectors);
    var self = this;
    el.innerHTML = all.map(function (s) {
        return '<button class="tab ' + (cur === s ? 'active' : '') + '" data-isf="' + s + '">' + s + '</button>';
    }).join('');
    el.querySelectorAll('.tab').forEach(function (b) {
        b.onclick = function () {
            self.currentSectorFilter = b.dataset.isf;
            self.render(appStore.state);
        };
    });
};

InconformidadesView.prototype._stageTabs = function (cur) {
    var el = document.getElementById('inconformidades-stage-tabs');
    if (!el) return;
    var stages = ['Todos', 'Em análise', 'Em andamento', 'Finalizado'];
    var self = this;
    el.innerHTML = stages.map(function (s) {
        return '<button class="tab ' + (cur === s ? 'active' : '') + '" data-stg="' + s + '">' + s + '</button>';
    }).join('');
    el.querySelectorAll('.tab').forEach(function (b) {
        b.onclick = function () {
            self.currentStageFilter = b.dataset.stg;
            self.render(appStore.state);
        };
    });
};

InconformidadesView.prototype._card = function (inc) {
    var statusText = inc.status || 'Em análise';
    var bc = 'badge-default';
    if (statusText === 'Finalizado') bc = 'badge-success';
    else if (statusText === 'Em andamento') bc = 'badge-progress';
    else if (statusText === 'Em análise') bc = 'badge-warning';
    
    var dataStr = '—';
    if (inc.dataCriacao) {
        try {
            dataStr = formatDate(inc.dataCriacao.split('T')[0]);
        } catch (e) {
            dataStr = inc.dataCriacao;
        }
    } else if (inc.criadoEm) {
        try {
            var dateObj = inc.criadoEm.toDate ? inc.criadoEm.toDate() : new Date(inc.criadoEm.seconds * 1000);
            dataStr = dateObj.toLocaleDateString('pt-BR');
        } catch (e) {
            dataStr = '—';
        }
    }
    
    // Linked project info
    var projHtml = '';
    var projId = inc.projetoId || inc.atividade_id;
    if (projId) {
        var p = appStore.getProjectById(projId);
        var projTitle = p ? (p.projeto || p.nome) : inc.atividade_titulo;
        if (projTitle) {
            projHtml = '<div class="kc-linked-project" style="display:flex;align-items:center;gap:4px;font-size:0.72rem;color:var(--text-secondary);margin-bottom:0.65rem;background:rgba(96,165,250,0.06);padding:0.35rem 0.55rem;border-radius:var(--radius-md);border:1px solid rgba(96,165,250,0.15);"><span class="material-symbols-rounded" style="font-size:1.15em;color:var(--color-info)">link</span><span>Processo: <strong>' + projTitle + '</strong></span></div>';
        }
    }
    
    // Affected sectors text
    var affectedStr = (inc.setoresAfetados || []).join(', ');
    var affectedHtml = affectedStr ? '<div style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:0.65rem;"><strong>Afeta:</strong> ' + affectedStr + '</div>' : '';
    
    var setorOrigem = inc.setor || inc.setor_registrou || 'Desconhecido';
    var descText = inc.descricao || 'Sem descrição';
    var userNome = inc.usuarioNome || inc.criadoPorNome || 'Desconhecido';
    
    return '<div class="kanban-card" data-id="' + inc.id + '">' +
           '  <div class="kc-sector" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 0.4rem;">' +
           '    <span>Origem: <strong>' + setorOrigem + '</strong></span>' +
           '    <span class="badge ' + bc + '">' + statusText + '</span>' +
           '  </div>' +
           '  <div class="kc-title" style="font-size:0.9rem; margin-bottom: 0.6rem; font-weight:600; white-space:pre-wrap;">' + descText + '</div>' +
           affectedHtml +
           projHtml +
           (inc.observacao ? '  <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom: 0.65rem; display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;"><strong>Ação/Obs:</strong> ' + inc.observacao + '</p>' : '') +
           '  <div class="kc-footer" style="margin-top:auto; font-size:0.7rem; color:var(--text-muted);">' +
           '    <span>Registrado por <strong>' + userNome + '</strong> em ' + dataStr + '</span>' +
           '  </div>' +
           '</div>';
};

function openInconformidadeEditor(id) {
    var form = document.getElementById('inconformidade-form');
    form.reset();
    
    var selOrigem = document.getElementById('field-inc-setor-origem');
    selOrigem.innerHTML = appStore.state.sectors.map(function (s) { return '<option value="' + s + '">' + s + '</option>'; }).join('');
    
    var cbGrid = document.getElementById('field-inc-setores-afetados');
    cbGrid.innerHTML = appStore.state.sectors.map(function (s) {
        return '<label class="checkbox-item"><input type="checkbox" value="' + s + '"> ' + s + '</label>';
    }).join('');
    
    var selProj = document.getElementById('field-inc-projeto-vinculado');
    
    function updateLinkedProjectsSelect(selectedSector, selectedProjId) {
        var sortedProjs = appStore.state.projects.filter(function(p) {
            return p.projeto !== '__SECTOR_PLACEHOLDER__' && p.setor === selectedSector;
        }).sort(function(a, b) {
            return a.projeto.localeCompare(b.projeto);
        });
        
        selProj.innerHTML = '<option value="">(Nenhum processo vinculado)</option>' +
            sortedProjs.map(function(p) {
                return '<option value="' + p.id + '">' + p.projeto + '</option>';
            }).join('');
            
        if (selectedProjId) {
            selProj.value = selectedProjId;
        } else {
            selProj.value = '';
        }
    }
    
    selOrigem.onchange = function() {
        updateLinkedProjectsSelect(this.value, null);
    };
    
    var titleEl = document.getElementById('inc-dialog-title');
    var btnDelete = document.getElementById('btn-delete-inconformidade');
    var commentGroup = document.getElementById('inc-new-comment-group');
    var historyContainer = document.getElementById('inc-history-container');
    
    var session = AuthManager.getSession();
    var isAdmin = session && session.nivelAcesso === 'Admin';
    
    var initialSector = '';
    var initialProjId = '';
    
    if (id) {
        var inc = appStore.state.inconformidades.find(function (x) { return x.id === id; });
        if (!inc) return;
        
        document.getElementById('field-inc-id').value = inc.id;
        document.getElementById('field-inc-descricao').value = inc.descricao || '';
        selOrigem.value = inc.setor || inc.setor_registrou || '';
        document.getElementById('field-inc-status').value = inc.status || 'Em análise';
        document.getElementById('field-inc-observacao').value = inc.observacao || '';
        document.getElementById('field-inc-new-comment').value = '';
        
        initialSector = inc.setor || inc.setor_registrou || '';
        initialProjId = inc.projetoId || inc.atividade_id || '';
        
        // Check checkboxes for affected sectors
        (inc.setoresAfetados || []).forEach(function (sec) {
            var cb = cbGrid.querySelector('input[value="' + sec + '"]');
            if (cb) cb.checked = true;
        });
        
        commentGroup.style.display = 'block';
        btnDelete.style.display = isAdmin ? 'inline-flex' : 'none';
        
        historyContainer.style.display = 'block';
        var hist = (inc.historico || []).slice().reverse();
        document.getElementById('inc-timeline-list').innerHTML = hist.map(function (h) {
            var d;
            try { d = new Date(h.dataAlteracao).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { d = h.dataAlteracao; }
            return '<div class="timeline-item">' +
                   '  <div class="tl-date">' + d + ' \u00b7 ' + h.usuarioNome + '</div>' +
                   '  <div class="tl-content" style="padding: 0.5rem 0.65rem;">' +
                   '    <h4 style="font-size:0.75rem;">Status: ' + h.statusNovo + '</h4>' +
                   '    <p style="font-size:0.7rem; color:var(--text-secondary); margin-top:2px;">' + h.observacao + '</p>' +
                   '  </div>' +
                   '</div>';
        }).join('') || '<p style="color:var(--text-muted); font-size:0.75rem;">Sem histórico de alterações.</p>';
        
    } else {
        titleEl.textContent = 'Nova Inconformidade';
        document.getElementById('field-inc-id').value = '';
        commentGroup.style.display = 'none';
        btnDelete.style.display = 'none';
        historyContainer.style.display = 'none';
        
        if (session && session.setorBase && session.setorBase !== 'Geral') {
            selOrigem.value = session.setorBase;
            initialSector = session.setorBase;
        } else {
            initialSector = selOrigem.value;
        }
    }
    
    // Populate the linked project dropdown with the initial sector
    updateLinkedProjectsSelect(initialSector, initialProjId);
    
    showOverlay();
    document.getElementById('inconformidade-dialog').show();
}
window.openInconformidadeEditor = openInconformidadeEditor;