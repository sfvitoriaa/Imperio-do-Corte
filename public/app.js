const icons = {
  dashboard: '<svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
  clientes: '<svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
  profissionais: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/><path d="M8 8h8"/></svg>',
  servicos: '<svg viewBox="0 0 24 24"><circle cx="6" cy="7" r="3"/><circle cx="6" cy="17" r="3"/><path d="M8.5 8.5 21 21M8.5 15.5 21 3"/></svg>',
  agendamentos: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></svg>',
  horarios: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  historico: '<svg viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l4 2"/></svg>',
  notificacoes: '<svg viewBox="0 0 24 24"><path d="M18 16v-5a6 6 0 0 0-12 0v5l-2 2h16l-2-2ZM10 20h4"/></svg>',
  pagamentos: '<svg viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20M6 15h3"/></svg>',
  relatorios: '<svg viewBox="0 0 24 24"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
};

const pages = [
  { id: 'dashboard', label: 'Dashboard', title: 'Dashboard', subtitle: 'Visão geral da barbearia' },
  { id: 'clientes', label: 'Clientes', title: 'Clientes', subtitle: 'Gerencie os clientes cadastrados' },
  { id: 'profissionais', label: 'Profissionais', title: 'Profissionais', subtitle: 'Gerencie a equipe da barbearia' },
  { id: 'servicos', label: 'Serviços', title: 'Serviços', subtitle: 'Configure os serviços oferecidos' },
  { id: 'agendamentos', label: 'Agendamentos', title: 'Agendamentos', subtitle: 'Acompanhe os horários marcados' },
  { id: 'horarios', label: 'Horários', title: 'Horários', subtitle: 'Configure a disponibilidade da equipe' },
  { id: 'historico', label: 'Histórico', title: 'Histórico', subtitle: 'Consulte registros anteriores' },
  { id: 'notificacoes', label: 'Notificações', title: 'Notificações', subtitle: 'Central de avisos do sistema' },
  { id: 'pagamentos', label: 'Pagamentos', title: 'Pagamentos', subtitle: 'Acompanhe os pagamentos registrados' },
  { id: 'relatorios', label: 'Relatórios', title: 'Relatórios', subtitle: 'Consulte indicadores do negócio' },
];

const nav = document.querySelector('#sidebar-nav');
const content = document.querySelector('#content');
const sidebar = document.querySelector('#sidebar');
const backdrop = document.querySelector('#sidebar-backdrop');
const menuToggle = document.querySelector('#menu-toggle');
const SELECTED_COMPANY_KEY = 'barbercut:selected-company';

let selectedCompany = null;
let appointmentsLoadSequence = 0;
let notificationCache = null;
let notificationRequest = null;
let notificationCenterItems = [];
let notificationBellErrorCompany = null;

try {
  selectedCompany = JSON.parse(localStorage.getItem(SELECTED_COMPANY_KEY));
} catch {
  localStorage.removeItem(SELECTED_COMPANY_KEY);
}

function getInitials(name) {
  if (!name) return '—';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0])
    .join('')
    .toUpperCase();
}

function updateSelectedCompany(company) {
  selectedCompany = company;

  if (company) {
    localStorage.setItem(SELECTED_COMPANY_KEY, JSON.stringify(company));
  } else {
    localStorage.removeItem(SELECTED_COMPANY_KEY);
  }

  const name = company?.nome || 'Nenhuma empresa selecionada';
  const initials = getInitials(company?.nome);
  document.querySelector('#company-name').textContent = name;
  document.querySelector('#company-switcher-name').textContent = name;
  document.querySelector('#company-avatar').textContent = initials;
}

updateSelectedCompany(selectedCompany);

async function apiFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});

  if (selectedCompany?.id) {
    headers.set('x-empresa-id', String(selectedCompany.id));
  }

  const response = await fetch(path, { ...options, headers });
  if (!response.ok) {
    let message = `Erro ${response.status}`;
    try {
      const body = await response.json();
      message = body.message || message;
    } catch {
      // Keep the status-based message when the response is not JSON.
    }
    throw new Error(message);
  }

  return response.json();
}

function notificationKey(notification) {
  const data = notification.dados || {};
  return [
    notification.tipo,
    notification.referenciaId,
    data.id || '',
    data.criadoEm || '',
  ].join(':');
}

function readSeenNotifications(companyId) {
  try {
    const stored = JSON.parse(localStorage.getItem(`barbercut:notifications:seen:${companyId}`) || '[]');
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function saveSeenNotifications(companyId, seen) {
  try {
    localStorage.setItem(`barbercut:notifications:seen:${companyId}`, JSON.stringify([...seen]));
    return true;
  } catch {
    return false;
  }
}

async function getNotifications(forceRefresh = false) {
  const companyId = selectedCompany?.id;
  if (!companyId) return [];
  if (!forceRefresh && notificationCache?.companyId === companyId &&
      Date.now() - notificationCache.loadedAt < 30_000) {
    return notificationCache.items;
  }
  if (notificationRequest?.companyId === companyId) {
    return notificationRequest.promise;
  }

  const request = { companyId, promise: null };
  request.promise = apiFetch('/notificacoes').then((notifications) => {
    if (!Array.isArray(notifications)) throw new Error('A API retornou uma lista de notificações inválida.');
    if (selectedCompany?.id === companyId) {
      notificationCache = { companyId, items: notifications, loadedAt: Date.now() };
    }
    return notifications;
  });
  notificationRequest = request;
  try {
    return await request.promise;
  } finally {
    if (notificationRequest === request) notificationRequest = null;
  }
}

async function updateNotificationBell() {
  const button = document.querySelector('#notification-button');
  const badge = document.querySelector('#notification-count');
  const companyId = selectedCompany?.id;
  if (!button || !badge || !companyId) return;
  try {
    const notifications = await getNotifications();
    if (selectedCompany?.id !== companyId || !button.isConnected) return;
    const seen = readSeenNotifications(companyId);
    const unreadCount = notifications.filter((item) => !seen.has(notificationKey(item))).length;
    badge.hidden = unreadCount === 0;
    badge.textContent = unreadCount > 99 ? '99+' : String(unreadCount);
    button.setAttribute(
      'aria-label',
      unreadCount ? `Notificações, ${unreadCount} não visualizada${unreadCount === 1 ? '' : 's'}` : 'Notificações',
    );
    button.title = unreadCount ? `${unreadCount} notificação(ões) não visualizada(s)` : 'Notificações';
    notificationBellErrorCompany = null;
  } catch (error) {
    if (selectedCompany?.id !== companyId || !button.isConnected) return;
    badge.hidden = true;
    button.setAttribute('aria-label', 'Notificações (não foi possível atualizar)');
    button.title = 'Não foi possível atualizar as notificações';
    if (notificationBellErrorCompany !== companyId) {
      showToast(`Não foi possível atualizar as notificações: ${error.message}`, 'error');
      notificationBellErrorCompany = companyId;
    }
  }
}

nav.innerHTML = pages.map((page) => `
  <a class="nav-link" href="#/${page.id}" data-page="${page.id}">
    ${icons[page.id]}
    <span>${page.label}</span>
  </a>
`).join('');

function dashboardContent() {
  return `
    <div class="page-header">
      <div>
        <h2>Dashboard</h2>
        <p id="dashboard-date"></p>
      </div>
      <button class="action-button" type="button" id="refresh-dashboard">Atualizar</button>
    </div>
    <div class="dashboard-error" id="dashboard-error" role="alert" hidden></div>
    <div class="dashboard-stats" id="dashboard-stats" aria-live="polite">
      ${['Agendamentos de hoje', 'Pendentes', 'Concluídos', 'Cancelamentos']
        .map((label) => `<article class="card stat-card"><h3>${label}</h3><p class="card-value"><span class="spinner" aria-label="Carregando"></span></p></article>`)
        .join('')}
    </div>
    <div class="dashboard-columns">
      <section class="dashboard-panel">
        <div class="panel-heading">
          <div><h3>Próximos agendamentos</h3><p>Atendimentos de hoje que ainda vão começar</p></div>
          <a class="text-link" href="#/agendamentos">Ver agenda</a>
        </div>
        <div id="upcoming-appointments" class="appointment-list" aria-live="polite"></div>
      </section>
      <section class="dashboard-panel attention-panel">
        <div class="panel-heading">
          <div><h3>Horários que precisam de atenção</h3><p>Pendências e alterações registradas</p></div>
        </div>
        <div id="schedule-attention" class="attention-list" aria-live="polite"></div>
      </section>
    </div>
    <dialog class="appointment-dialog" id="appointment-dialog" aria-labelledby="appointment-dialog-title">
      <div class="dialog-heading">
        <div><span class="topbar-label">Detalhes do atendimento</span><h2 id="appointment-dialog-title">Agendamento</h2></div>
        <button class="dialog-close" type="button" aria-label="Fechar detalhes">&times;</button>
      </div>
      <div id="appointment-details" class="appointment-details"></div>
    </dialog>
  `;
}

const appointmentStatusLabels = {
  PENDENTE: 'Pendente',
  AGENDADO: 'Agendado',
  CONCLUIDO: 'Concluído',
  CANCELADO: 'Cancelado',
  FALTOU: 'Não compareceu',
  NAO_COMPARECEU: 'Não compareceu',
};

function localDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDateTime(value, options = {}) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Horário indisponível';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  });
}

function formatTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatAppointmentDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data indisponível'
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function appointmentServiceNames(appointment) {
  return (appointment.servicos || [])
    .map((item) => item.servico?.nome)
    .filter(Boolean)
    .join(', ');
}

function attentionItems(notifications, appointments, now) {
  const overdue = appointments
    .filter((appointment) =>
      ['AGENDADO', 'PENDENTE'].includes(appointment.status) &&
      new Date(appointment.fim) < now,
    )
    .map((appointment) => ({
      id: `overdue-${appointment.id}`,
      appointmentId: appointment.id,
      title: 'Atendimento pendente após o horário',
      description: `${appointment.cliente?.nome || 'Cliente não informado'} · ${formatDateTime(appointment.inicio)}`,
      type: 'overdue',
    }));

  const scheduleChanges = notifications
    .filter((notification) =>
      ['ALTERACAO_HORARIO', 'PENDENTE_FINALIZACAO'].includes(notification.tipo),
    )
    .map((notification) => ({
      id: `${notification.tipo}-${notification.referenciaId}`,
      appointmentId: notification.tipo === 'PENDENTE_FINALIZACAO'
        ? notification.dados?.id
        : undefined,
      title: notification.tipo === 'ALTERACAO_HORARIO'
        ? 'Alteração de horário'
        : 'Atendimento aguardando finalização',
      description: notification.dados?.mensagem ||
        (notification.dados?.cliente?.nome
          ? `${notification.dados.cliente.nome} · ${formatDateTime(notification.dados.inicio)}`
          : `Referência #${notification.referenciaId}`),
      type: notification.tipo === 'ALTERACAO_HORARIO' ? 'change' : 'overdue',
    }));

  const unique = new Map();
  [...overdue, ...scheduleChanges].forEach((item) => {
    unique.set(item.appointmentId ? `appointment-${item.appointmentId}` : item.id, item);
  });
  return [...unique.values()];
}

async function loadDashboard() {
  const companyId = selectedCompany?.id;
  const route = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  if (!companyId || route !== 'dashboard') return;

  const errorBox = document.querySelector('#dashboard-error');
  const stats = document.querySelector('#dashboard-stats');
  const upcomingList = document.querySelector('#upcoming-appointments');
  const attentionList = document.querySelector('#schedule-attention');
  const refreshButton = document.querySelector('#refresh-dashboard');
  const now = new Date();
  document.querySelector('#dashboard-date').textContent = now.toLocaleDateString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  refreshButton.disabled = true;
  errorBox.hidden = true;
  stats.innerHTML = ['Agendamentos de hoje', 'Pendentes', 'Concluídos', 'Cancelamentos']
    .map((label) => `<article class="card stat-card"><h3>${label}</h3><p class="card-value"><span class="spinner" aria-label="Carregando"></span></p></article>`)
    .join('');
  upcomingList.innerHTML = '<div class="inline-loading"><span class="spinner" aria-label="Carregando"></span><span>Buscando agenda...</span></div>';
  attentionList.innerHTML = '<div class="inline-loading"><span class="spinner" aria-label="Carregando"></span><span>Buscando pendências...</span></div>';

  try {
    const [appointments, notifications] = await Promise.all([
      apiFetch(`/agendamentos?data=${localDateKey(now)}`),
      getNotifications(),
    ]);

    if (selectedCompany?.id !== companyId ||
        (window.location.hash.replace(/^#\/?/, '') || 'dashboard') !== 'dashboard') return;

    if (!Array.isArray(appointments) || !Array.isArray(notifications)) {
      throw new Error('A API retornou dados inválidos para o dashboard.');
    }

    const todaysAppointments = appointments;
    const pending = todaysAppointments.filter((item) => ['AGENDADO', 'PENDENTE'].includes(item.status));
    const completed = todaysAppointments.filter((item) => item.status === 'CONCLUIDO');
    const cancelled = todaysAppointments.filter((item) => item.status === 'CANCELADO');

    stats.innerHTML = [
      ['Agendamentos de hoje', todaysAppointments.length, 'total'],
      ['Pendentes', pending.length, 'pending'],
      ['Concluídos', completed.length, 'completed'],
      ['Cancelamentos', cancelled.length, 'cancelled'],
    ].map(([label, count, type]) => `
      <article class="card stat-card stat-${type}">
        <h3>${label}</h3>
        <p class="card-value">${count}</p>
      </article>
    `).join('');

    const upcoming = pending
      .filter((item) => new Date(item.inicio) >= now)
      .sort((a, b) => new Date(a.inicio) - new Date(b.inicio));

    upcomingList.innerHTML = upcoming.length
      ? upcoming.map((appointment) => `
        <article class="appointment-row">
          <div class="appointment-time">
            <strong>${formatTime(appointment.inicio)}</strong>
            <span>${formatAppointmentDate(appointment.inicio)}</span>
          </div>
          <div class="appointment-summary">
            <strong>${escapeHtml(appointment.cliente?.nome || 'Cliente não informado')}</strong>
            <span>${escapeHtml(appointment.profissional?.nome || 'Profissional não informado')}</span>
            <small>${escapeHtml(appointmentServiceNames(appointment) || 'Serviço não informado')}</small>
          </div>
          <span class="status-badge status-${appointment.status.toLowerCase()}">${appointmentStatusLabels[appointment.status] || escapeHtml(appointment.status)}</span>
          <button class="details-button" type="button" data-appointment-id="${appointment.id}">Detalhes</button>
        </article>
      `).join('')
      : '<div class="empty-inline"><strong>Nenhum próximo atendimento</strong><span>Não há outros horários pendentes hoje.</span></div>';

    const attention = attentionItems(notifications, todaysAppointments, now);
    attentionList.innerHTML = attention.length
      ? attention.map((item) => `
        <article class="attention-item attention-${item.type}">
          <span class="attention-indicator" aria-hidden="true"></span>
          <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.description)}</span></div>
          ${item.appointmentId ? `<button class="details-button" type="button" data-appointment-id="${item.appointmentId}">Detalhes</button>` : ''}
        </article>
      `).join('')
      : '<div class="empty-inline"><strong>Tudo em dia</strong><span>Nenhum horário precisa de atenção.</span></div>';

    upcomingList.querySelectorAll('[data-appointment-id]').forEach((button) => {
      button.addEventListener('click', () => showAppointmentDetails(button.dataset.appointmentId, companyId));
    });
    attentionList.querySelectorAll('[data-appointment-id]').forEach((button) => {
      button.addEventListener('click', () => showAppointmentDetails(button.dataset.appointmentId, companyId));
    });
  } catch (error) {
    if (selectedCompany?.id !== companyId) return;
    stats.innerHTML = '';
    upcomingList.innerHTML = '';
    attentionList.innerHTML = '';
    errorBox.innerHTML = `
      <div><strong>Não foi possível carregar o dashboard</strong><span>${escapeHtml(error.message)}</span></div>
      <button class="action-button" type="button" id="retry-dashboard">Tentar novamente</button>
    `;
    errorBox.hidden = false;
    document.querySelector('#retry-dashboard').addEventListener('click', loadDashboard);
  } finally {
    if (selectedCompany?.id === companyId && refreshButton.isConnected) refreshButton.disabled = false;
  }
}

async function showAppointmentDetails(appointmentId, companyId) {
  const dialog = document.querySelector('#appointment-dialog');
  const details = document.querySelector('#appointment-details');
  if (!dialog || !details) return;

  details.innerHTML = '<div class="inline-loading"><span class="spinner" aria-label="Carregando"></span><span>Carregando detalhes...</span></div>';
  dialog.showModal();

  try {
    const appointment = await apiFetch(`/agendamentos/${appointmentId}`);
    if (selectedCompany?.id !== companyId) {
      dialog.close();
      return;
    }

    const services = (appointment.servicos || [])
      .map((item) => item.servico?.nome)
      .filter(Boolean);
    details.innerHTML = `
      <dl>
        <div><dt>Data e horário</dt><dd>${escapeHtml(formatDateTime(appointment.inicio))}</dd></div>
        <div><dt>Cliente</dt><dd>${escapeHtml(appointment.cliente?.nome || 'Não informado')}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml(appointment.cliente?.telefone || 'Não informado')}</dd></div>
        <div><dt>Profissional</dt><dd>${escapeHtml(appointment.profissional?.nome || 'Não informado')}</dd></div>
        <div><dt>Serviços</dt><dd>${escapeHtml(services.join(', ') || 'Não informado')}</dd></div>
        <div><dt>Status</dt><dd>${escapeHtml(appointmentStatusLabels[appointment.status] || appointment.status)}</dd></div>
      </dl>
    `;
  } catch (error) {
    details.innerHTML = `<p class="details-error" role="alert">Não foi possível carregar os detalhes: ${escapeHtml(error.message)}</p>`;
  }
}

function pageContent(page) {
  if (page.id === 'dashboard') return dashboardContent();
  if (page.id === 'clientes') return clientsContent();
  if (page.id === 'profissionais') return professionalsContent();
  if (page.id === 'servicos') return servicesContent();
  if (page.id === 'agendamentos') return appointmentsContent();
  if (page.id === 'pagamentos') return paymentsContent();
  if (page.id === 'notificacoes') return notificationsContent();
  if (page.id === 'relatorios') return reportsContent();

  const actionLabels = {
    agendamentos: 'Novo agendamento',
  };
  const action = actionLabels[page.id]
    ? `<button class="action-button" type="button" aria-label="${actionLabels[page.id]}">${actionLabels[page.id]}</button>`
    : '';

  return `
    <div class="page-header">
      <div>
        <h2>${page.title}</h2>
        <p>${page.subtitle}</p>
      </div>
      ${action}
    </div>
    <article class="card card-empty">
      <div>
        <strong>Conteúdo em preparação</strong>
        <p>Esta área está pronta para receber os dados e as ações desta seção.</p>
      </div>
    </article>
  `;
}

function appointmentsContent() {
  return `
    <div class="page-header">
      <div><h2>Agendamentos</h2><p>Consulte horários e organize os atendimentos da empresa selecionada</p></div>
      <button class="action-button" type="button" id="new-appointment">+ Novo agendamento</button>
    </div>
    <div class="management-toolbar">
      <form class="appointment-filters" id="appointment-filters">
        <label class="search-field">Cliente
          <input type="search" name="cliente" placeholder="Pesquisar cliente" autocomplete="off" />
        </label>
        <label class="search-field">Profissional
          <select name="profissional"><option value="">Todos os profissionais</option></select>
        </label>
        <label class="search-field">Data
          <input type="date" name="data" value="${localDateKey(new Date())}" />
        </label>
        <label class="search-field">Situação
          <select name="status">
            <option value="">Todas</option>
            <option value="PENDENTE">Pendente</option>
            <option value="AGENDADO">Agendado</option>
            <option value="CONCLUIDO">Concluído</option>
            <option value="CANCELADO">Cancelado</option>
            <option value="FALTOU">Não compareceu</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="action-button" type="submit">Filtrar</button>
          <button class="secondary-button" type="button" id="clear-appointment-filters">Limpar</button>
        </div>
      </form>
    </div>
    <div class="management-error" id="appointments-error" role="alert" hidden></div>
    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table appointments-table">
          <thead><tr><th>Data e horário</th><th>Cliente</th><th>Profissional</th><th>Serviço</th><th>Valor</th><th>Situação</th><th class="actions-column">Ações</th></tr></thead>
          <tbody id="appointments-table-body"><tr><td colspan="7"><div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando agendamentos...</span></div></td></tr></tbody>
        </table>
      </div>
    </div>
    <dialog class="entity-dialog appointment-dialog-form" id="appointment-form-dialog" aria-labelledby="appointment-form-title">
      <div class="dialog-heading">
        <div><span class="topbar-label">Atendimento</span><h2 id="appointment-form-title">Novo agendamento</h2></div>
        <button class="dialog-close" type="button" data-close-appointment aria-label="Fechar">&times;</button>
      </div>
      <div class="entity-dialog-content" id="appointment-form-content"></div>
    </dialog>
  `;
}

function agendaWallDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Data indisponível'
    : date.toLocaleDateString('pt-BR', { timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric' });
}

function agendaWallTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleTimeString('pt-BR', { timeZone: 'UTC', hour: '2-digit', minute: '2-digit' });
}

function appointmentPrice(appointment) {
  return (appointment.servicos || []).reduce((total, item) => total + Number(item.precoCobrado || 0), 0);
}

function initAppointmentsPage() {
  const body = document.querySelector('#appointments-table-body');
  if (!body) return;
  const dialog = document.querySelector('#appointment-form-dialog');
  document.querySelector('#new-appointment').addEventListener('click', () => openAppointmentForm());
  document.querySelector('[data-close-appointment]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.querySelector('#appointment-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    loadAppointments();
  });
  document.querySelector('#clear-appointment-filters').addEventListener('click', () => {
    const form = document.querySelector('#appointment-filters');
    form.reset();
    form.elements.data.value = '';
    loadAppointments();
  });
  body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-appointment-action]');
    if (!button) return;
    const appointmentId = Number(button.dataset.appointmentId);
    if (button.dataset.appointmentAction === 'edit') openAppointmentForm({ id: appointmentId });
    if (button.dataset.appointmentAction === 'cancel') cancelAppointment(appointmentId);
  });
  loadAppointmentProfessionals();
  loadAppointments();
}

async function loadAppointmentProfessionals() {
  const select = document.querySelector('#appointment-filters select[name="profissional"]');
  const companyId = selectedCompany?.id;
  if (!select || !companyId) return;
  try {
    const professionals = await apiFetch('/profissionais?ativos=true');
    if (selectedCompany?.id !== companyId || !select.isConnected) return;
    if (!Array.isArray(professionals)) throw new Error('A API retornou uma lista de profissionais inválida.');
    select.innerHTML = '<option value="">Todos os profissionais</option>' +
      professionals.map((professional) => `<option value="${professional.id}">${escapeHtml(professional.nome)}</option>`).join('');
  } catch (error) {
    showToast(`Não foi possível carregar os profissionais: ${error.message}`, 'error');
  }
}

async function loadAppointments() {
  const body = document.querySelector('#appointments-table-body');
  const errorBox = document.querySelector('#appointments-error');
  const filters = document.querySelector('#appointment-filters');
  const companyId = selectedCompany?.id;
  if (!body || !filters || !companyId) return;
  const params = new URLSearchParams();
  const date = filters.elements.data.value;
  const professionalId = filters.elements.profissional.value;
  if (date) params.set('data', date);
  if (professionalId) params.set('profissionalId', professionalId);
  const clientSearch = filters.elements.cliente.value.trim().toLocaleLowerCase('pt-BR');
  const status = filters.elements.status.value;
  const sequence = ++appointmentsLoadSequence;
  errorBox.hidden = true;
  body.innerHTML = '<tr><td colspan="7"><div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando agendamentos...</span></div></td></tr>';

  try {
    const query = params.toString();
    const appointments = await apiFetch(`/agendamentos${query ? `?${query}` : ''}`);
    if (!Array.isArray(appointments)) throw new Error('A API retornou uma lista de agendamentos inválida.');
    if (selectedCompany?.id !== companyId || !body.isConnected || sequence !== appointmentsLoadSequence) return;
    const visible = appointments.filter((appointment) =>
      (!clientSearch || String(appointment.cliente?.nome || '').toLocaleLowerCase('pt-BR').includes(clientSearch)) &&
      (!status || appointment.status === status),
    );
    body.innerHTML = visible.length
      ? visible.map((appointment) => {
        const editable = ['AGENDADO', 'PENDENTE'].includes(appointment.status);
        const services = (appointment.servicos || []).map((item) => item.servico?.nome).filter(Boolean).join(', ');
        return `<tr>
          <td><strong class="table-primary">${escapeHtml(agendaWallDate(appointment.inicio))}</strong><small class="appointment-time-cell">${escapeHtml(agendaWallTime(appointment.inicio))}</small></td>
          <td>${escapeHtml(appointment.cliente?.nome || 'Cliente não informado')}<small class="appointment-time-cell">${escapeHtml(formatPhone(appointment.cliente?.telefone))}</small></td>
          <td>${escapeHtml(appointment.profissional?.nome || '—')}</td>
          <td>${escapeHtml(services || '—')}</td>
          <td>${escapeHtml(formatCurrency(appointmentPrice(appointment)))}</td>
          <td><span class="status-badge status-${escapeHtml(String(appointment.status).toLowerCase())}">${escapeHtml(appointmentStatusLabels[appointment.status] || appointment.status)}</span></td>
          <td class="table-actions">${editable
            ? `<button class="table-action" type="button" data-appointment-action="edit" data-appointment-id="${appointment.id}">Editar</button><button class="table-action appointment-cancel-action" type="button" data-appointment-action="cancel" data-appointment-id="${appointment.id}">Cancelar</button>`
            : '—'}</td>
        </tr>`;
      }).join('')
      : '<tr><td colspan="7"><div class="table-state"><strong>Nenhum agendamento encontrado</strong><span>Revise os filtros ou crie um novo agendamento.</span></div></td></tr>';
  } catch (error) {
    if (selectedCompany?.id !== companyId || !body.isConnected || sequence !== appointmentsLoadSequence) return;
    body.innerHTML = '<tr><td colspan="7"><div class="table-state">A agenda não está disponível.</div></td></tr>';
    errorBox.innerHTML = `<span>Não foi possível carregar os agendamentos: ${escapeHtml(error.message)}</span><button class="secondary-button" type="button" id="retry-appointments">Tentar novamente</button>`;
    errorBox.hidden = false;
    document.querySelector('#retry-appointments').addEventListener('click', loadAppointments);
  }
}

async function openAppointmentForm(appointmentRef = null) {
  const dialog = document.querySelector('#appointment-form-dialog');
  const content = document.querySelector('#appointment-form-content');
  const title = document.querySelector('#appointment-form-title');
  const companyId = selectedCompany?.id;
  if (!dialog || !content || !companyId) return;
  title.textContent = appointmentRef ? 'Editar agendamento' : 'Novo agendamento';
  content.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Preparando o agendamento...</span></div>';
  dialog.showModal();
  let appointment = null;
  try {
    const [professionals, services] = await Promise.all([
      apiFetch('/profissionais?ativos=true'),
      apiFetch('/servicos?ativos=true'),
    ]);
    if (appointmentRef) appointment = await apiFetch(`/agendamentos/${appointmentRef.id}`);
    if (selectedCompany?.id !== companyId || !dialog.open) return;
    if (!Array.isArray(professionals) || !Array.isArray(services)) throw new Error('A API retornou dados inválidos para o formulário.');
    renderAppointmentForm({ appointment, professionals, services, companyId });
  } catch (error) {
    content.innerHTML = `<p class="form-error">Não foi possível carregar os dados do agendamento: ${escapeHtml(error.message)}</p>`;
  }
}

function renderAppointmentForm({ appointment, professionals, services, companyId }) {
  const content = document.querySelector('#appointment-form-content');
  const initialServiceId = appointment?.servicos?.[0]?.servico?.id || '';
  const initialClient = appointment?.cliente || null;
  const initialDate = appointment?.inicio
    ? new Date(appointment.inicio).toISOString().slice(0, 10)
    : localDateKey(new Date());
  const initialTime = appointment?.inicio ? agendaWallTime(appointment.inicio) : '';
  content.innerHTML = `
    <form class="entity-form appointment-form" id="appointment-form" novalidate>
      <section class="appointment-form-section">
        <div class="appointment-section-heading"><span>1</span><strong>Cliente</strong></div>
        <label>Pesquisar cliente por nome ou telefone
          <input type="search" name="clienteBusca" placeholder="Digite o nome ou telefone" autocomplete="off" value="${escapeHtml(initialClient?.nome || '')}" />
        </label>
        <input type="hidden" name="clienteId" value="${initialClient?.id || ''}" />
        <div class="client-search-results" id="appointment-client-results" role="listbox"></div>
        <div class="appointment-client-selected" id="appointment-client-selected">${initialClient ? `Selecionado: <strong>${escapeHtml(initialClient.nome)}</strong>` : 'Selecione um cliente para continuar.'}</div>
        <button class="text-link appointment-inline-link" type="button" id="show-quick-client">+ Cadastrar cliente rápido</button>
        <div class="quick-client-form" id="quick-client-form" hidden>
          <label>Nome<input name="novoClienteNome" maxlength="191" autocomplete="name" /></label>
          <label>Telefone com DDD<input name="novoClienteTelefone" type="tel" inputmode="tel" placeholder="11987654321" autocomplete="tel" /></label>
          <button class="secondary-button" type="button" id="create-quick-client">Cadastrar e selecionar</button>
          <small class="field-error" id="quick-client-error"></small>
        </div>
      </section>
      <div class="form-grid">
        <label>Profissional
          <select name="profissionalId" required><option value="">Selecione</option>${professionals.map((person) => `<option value="${person.id}" ${Number(appointment?.profissionalId) === person.id ? 'selected' : ''}>${escapeHtml(person.nome)}</option>`).join('')}</select>
        </label>
        <label>Serviço
          <select name="servicoId" required><option value="">Selecione</option>${services.map((service) => `<option value="${service.id}" ${Number(initialServiceId) === service.id ? 'selected' : ''}>${escapeHtml(service.nome)}</option>`).join('')}</select>
        </label>
        <label>Data
          <input name="data" type="date" required min="${localDateKey(new Date())}" value="${escapeHtml(initialDate)}" />
        </label>
        <div class="appointment-service-summary" id="appointment-service-summary">Selecione um serviço para consultar preço e duração.</div>
      </div>
      <div class="appointment-availability">
        <button class="secondary-button" type="button" id="check-availability">Consultar horários disponíveis</button>
        <div class="appointment-slots" id="appointment-slots" aria-live="polite"><span>Escolha profissional, serviço e data.</span></div>
        <small class="field-error" id="appointment-form-error"></small>
      </div>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" data-close-appointment>Voltar</button>
        <button class="action-button" type="submit" disabled>${appointment ? 'Salvar alterações' : 'Confirmar agendamento'}</button>
      </div>
    </form>
  `;

  const form = content.querySelector('#appointment-form');
  const slots = content.querySelector('#appointment-slots');
  const submitButton = form.querySelector('[type="submit"]');
  const clientSearch = form.elements.clienteBusca;
  let selectedClient = initialClient;
  let selectedTime = initialTime;
  let searchTimer;
  let searchSequence = 0;
  let checkedAvailabilityKey = '';

  const updateClient = (client) => {
    selectedClient = client;
    form.elements.clienteId.value = client?.id || '';
    content.querySelector('#appointment-client-selected').innerHTML = client
      ? `Selecionado: <strong>${escapeHtml(client.nome)}</strong> · ${escapeHtml(formatPhone(client.telefone))}`
      : 'Selecione um cliente para continuar.';
    content.querySelector('#appointment-client-results').innerHTML = '';
  };
  const invalidateSlots = () => {
    selectedTime = '';
    checkedAvailabilityKey = '';
    submitButton.disabled = true;
    slots.innerHTML = '<span>Consulte os horários para continuar.</span>';
  };
  const availabilityKey = () => [
    form.elements.profissionalId.value,
    form.elements.servicoId.value,
    form.elements.data.value,
  ].join('|');

  clientSearch.addEventListener('input', () => {
    const sequence = ++searchSequence;
    updateClient(null);
    window.clearTimeout(searchTimer);
    const term = clientSearch.value.trim();
    const results = content.querySelector('#appointment-client-results');
    if (term.length < 2) {
      results.innerHTML = '';
      return;
    }
    searchTimer = window.setTimeout(async () => {
      try {
        const params = new URLSearchParams();
        if (/^\d[\d\s()+-]*$/.test(term)) params.set('telefone', term.replace(/\D/g, ''));
        else params.set('nome', term);
        const clients = await apiFetch(`/clientes?${params.toString()}`);
        if (!Array.isArray(clients)) throw new Error('A API retornou uma lista de clientes inválida.');
        if (sequence !== searchSequence || !results.isConnected) return;
        results.innerHTML = clients.length
          ? clients.slice(0, 6).map((client) => `<button class="client-result" type="button" data-client-id="${client.id}"><strong>${escapeHtml(client.nome)}</strong><span>${escapeHtml(formatPhone(client.telefone))}</span></button>`).join('')
          : '<span class="field-hint">Nenhum cliente encontrado. Você pode cadastrá-lo rapidamente.</span>';
        results.querySelectorAll('[data-client-id]').forEach((button) => {
          button.addEventListener('click', () => {
            const client = clients.find((item) => item.id === Number(button.dataset.clientId));
            if (!client) return;
            clientSearch.value = client.nome;
            updateClient(client);
          });
        });
      } catch (error) {
        if (sequence === searchSequence && results.isConnected) {
          results.innerHTML = `<span class="form-error">Falha na busca: ${escapeHtml(error.message)}</span>`;
        }
      }
    }, 250);
  });

  content.querySelector('#show-quick-client').addEventListener('click', () => {
    const quickForm = content.querySelector('#quick-client-form');
    quickForm.hidden = !quickForm.hidden;
    if (!quickForm.hidden) quickForm.querySelector('input').focus();
  });
  content.querySelector('#create-quick-client').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const name = form.elements.novoClienteNome.value.trim();
    const phone = form.elements.novoClienteTelefone.value.replace(/\D/g, '');
    const error = content.querySelector('#quick-client-error');
    error.textContent = '';
    if (!name || !/^\d{10,11}$/.test(phone)) {
      error.textContent = 'Informe o nome e um telefone com DDD (10 ou 11 dígitos).';
      return;
    }
    button.disabled = true;
    try {
      const client = await apiFetch('/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: name, telefone: phone }),
      });
      if (selectedCompany?.id !== companyId) return;
      clientSearch.value = client.nome;
      updateClient(client);
      content.querySelector('#quick-client-form').hidden = true;
      showToast('Cliente cadastrado e selecionado.');
    } catch (error) {
      content.querySelector('#quick-client-error').textContent = `Não foi possível cadastrar: ${error.message}`;
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });

  ['profissionalId', 'servicoId', 'data'].forEach((field) => {
    form.elements[field].addEventListener('change', invalidateSlots);
  });
  const updateServiceSummary = () => {
    const service = services.find((item) => item.id === Number(form.elements.servicoId.value));
    const appointmentService = appointment?.servicos?.find(
      (item) => item.servico?.id === service?.id,
    );
    const price = appointmentService?.precoCobrado ?? service?.preco;
    content.querySelector('#appointment-service-summary').innerHTML = service
      ? `<strong>${escapeHtml(formatCurrency(price))}</strong><span>${escapeHtml(String(service.duracaoMin))} min</span>`
      : 'Selecione um serviço para consultar preço e duração.';
  };
  form.elements.servicoId.addEventListener('change', updateServiceSummary);
  updateServiceSummary();
  content.querySelectorAll('[data-close-appointment]').forEach((button) => {
    button.addEventListener('click', () => document.querySelector('#appointment-form-dialog').close());
  });

  content.querySelector('#check-availability').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const professionalId = Number(form.elements.profissionalId.value);
    const serviceId = Number(form.elements.servicoId.value);
    const date = form.elements.data.value;
    const requestKey = availabilityKey();
    const formError = content.querySelector('#appointment-form-error');
    formError.textContent = '';
    selectedTime = '';
    submitButton.disabled = true;
    if (!professionalId || !serviceId || !date) {
      formError.textContent = 'Selecione profissional, serviço e data.';
      return;
    }
    button.disabled = true;
    slots.innerHTML = '<span class="inline-loading"><span class="spinner" aria-label="Carregando"></span> Consultando horários...</span>';
    try {
      const params = new URLSearchParams({ profissionalId: String(professionalId), servicoId: String(serviceId), data: date });
      const available = await apiFetch(`/agendamentos/disponibilidade?${params.toString()}`);
      if (!Array.isArray(available)) throw new Error('A API retornou horários inválidos.');
      if (selectedCompany?.id !== companyId || !form.isConnected) return;
      if (requestKey !== availabilityKey()) return;
      const isUnchangedCurrentSlot = appointment &&
        Number(appointment.profissionalId) === professionalId &&
        Number(appointment.servicos?.[0]?.servico?.id) === serviceId &&
        new Date(appointment.inicio).toISOString().slice(0, 10) === date;
      const currentTime = isUnchangedCurrentSlot ? agendaWallTime(appointment.inicio) : '';
      const choices = [...new Set([...available, ...(currentTime && !available.includes(currentTime) ? [currentTime] : [])])].sort();
      checkedAvailabilityKey = requestKey;
      slots.innerHTML = choices.length
        ? choices.map((time) => `<button class="appointment-slot ${time === currentTime ? 'current-slot' : ''}" type="button" data-slot="${time}">${time}${time === currentTime ? '<small>atual</small>' : ''}</button>`).join('')
        : '<span class="field-hint">Nenhum horário disponível nesta data. Escolha outro dia ou profissional.</span>';
      slots.querySelectorAll('[data-slot]').forEach((slot) => {
        slot.addEventListener('click', () => {
          selectedTime = slot.dataset.slot;
          slots.querySelectorAll('.appointment-slot').forEach((item) => item.classList.toggle('selected', item === slot));
          submitButton.disabled = false;
        });
      });
      if (currentTime && choices.includes(currentTime)) {
        selectedTime = currentTime;
        slots.querySelector(`[data-slot="${currentTime}"]`)?.classList.add('selected');
        submitButton.disabled = false;
      }
    } catch (error) {
      slots.innerHTML = `<span class="form-error">Não foi possível consultar a disponibilidade: ${escapeHtml(error.message)}</span>`;
    } finally {
      if (button.isConnected) button.disabled = false;
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const formError = content.querySelector('#appointment-form-error');
    formError.textContent = '';
    if (!selectedClient) {
      formError.textContent = 'Pesquise e selecione um cliente.';
      return;
    }
    if (!selectedTime || checkedAvailabilityKey !== availabilityKey()) {
      formError.textContent = 'Consulte a disponibilidade e selecione um horário antes de confirmar.';
      return;
    }
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      const params = new URLSearchParams({
        profissionalId: form.elements.profissionalId.value,
        servicoId: form.elements.servicoId.value,
        data: form.elements.data.value,
      });
      const available = await apiFetch(`/agendamentos/disponibilidade?${params.toString()}`);
      const isCurrentSlot = appointment &&
        Number(appointment.profissionalId) === Number(form.elements.profissionalId.value) &&
        Number(appointment.servicos?.[0]?.servico?.id) === Number(form.elements.servicoId.value) &&
        new Date(appointment.inicio).toISOString().slice(0, 10) === form.elements.data.value &&
        agendaWallTime(appointment.inicio) === selectedTime;
      if (!available.includes(selectedTime) && !isCurrentSlot) {
        throw new Error('Este horário acabou de ficar ocupado. Consulte novamente para escolher outro.');
      }
      const payload = {
        clienteId: Number(selectedClient.id),
        profissionalId: Number(form.elements.profissionalId.value),
        inicio: `${form.elements.data.value}T${selectedTime}:00.000Z`,
        ...(appointment && Number(form.elements.servicoId.value) === Number(initialServiceId)
          ? {}
          : { servicoIds: [Number(form.elements.servicoId.value)] }),
      };
      await apiFetch(appointment ? `/agendamentos/${appointment.id}/editar` : '/agendamentos', {
        method: appointment ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (selectedCompany?.id !== companyId) return;
      document.querySelector('#appointment-form-dialog').close();
      showToast(appointment ? 'Agendamento atualizado.' : 'Agendamento confirmado.');
      await loadAppointments();
    } catch (error) {
      formError.textContent = error.message.includes('ocupado')
        ? error.message
        : `Não foi possível confirmar: ${error.message}`;
      if (error.message.includes('ocupado') || error.message.includes('atendimento das')) {
        showToast('O horário não está mais disponível. Atualize os horários.', 'error');
        invalidateSlots();
        formError.textContent = error.message;
      }
    } finally {
      if (submit.isConnected) submit.disabled = !selectedTime;
    }
  });

  if (appointment && initialTime) content.querySelector('#check-availability').click();
}

async function cancelAppointment(appointmentId) {
  const confirmed = await confirmAction('Cancelar agendamento', 'Deseja realmente cancelar este atendimento?');
  if (!confirmed) return;
  try {
    await apiFetch(`/agendamentos/${appointmentId}/cancelar`, { method: 'POST' });
    showToast('Agendamento cancelado.');
    await loadAppointments();
  } catch (error) {
    showToast(`Não foi possível cancelar o agendamento: ${error.message}`, 'error');
  }
}

const paymentMethods = {
  DINHEIRO: 'Dinheiro',
  PIX: 'Pix',
  CARTAO_DEBITO: 'Débito',
  CARTAO_CREDITO: 'Crédito',
};
const paymentStatuses = { PENDENTE: 'Pendente', REALIZADO: 'Realizado' };
let paymentsLoadSequence = 0;

function paymentsContent() {
  return `
    <div class="page-header">
      <div><h2>Pagamentos</h2><p>Registre e consulte pagamentos vinculados aos atendimentos</p></div>
      <button class="action-button" type="button" id="new-payment">+ Registrar pagamento</button>
    </div>
    <div class="management-toolbar">
      <form class="payment-filters" id="payment-filters">
        <label class="search-field">Situação
          <select name="status">
            <option value="">Todos os pagamentos</option>
            <option value="PENDENTE">Pendentes</option>
            <option value="REALIZADO">Realizados</option>
          </select>
        </label>
        <label class="search-field">Data do pagamento
          <input type="date" name="data" />
        </label>
        <label class="search-field">Forma de pagamento
          <select name="forma">
            <option value="">Todas as formas</option>
            <option value="DINHEIRO">Dinheiro</option>
            <option value="PIX">Pix</option>
            <option value="CARTAO_DEBITO">Débito</option>
            <option value="CARTAO_CREDITO">Crédito</option>
          </select>
        </label>
        <div class="toolbar-actions">
          <button class="action-button" type="submit">Filtrar</button>
          <button class="secondary-button" type="button" id="clear-payment-filters">Limpar</button>
        </div>
      </form>
    </div>
    <div class="management-error" id="payments-error" role="alert" hidden></div>
    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table payments-table">
          <thead><tr><th>Data</th><th>Agendamento</th><th>Cliente</th><th>Forma</th><th>Valor</th><th>Situação</th><th class="actions-column">Ações</th></tr></thead>
          <tbody id="payments-table-body"><tr><td colspan="7"><div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando pagamentos...</span></div></td></tr></tbody>
        </table>
      </div>
    </div>
    <dialog class="entity-dialog payment-dialog" id="payment-form-dialog" aria-labelledby="payment-form-title">
      <div class="dialog-heading">
        <div><span class="topbar-label">Registro manual</span><h2 id="payment-form-title">Registrar pagamento</h2></div>
        <button class="dialog-close" type="button" data-close-payment aria-label="Fechar">&times;</button>
      </div>
      <div class="entity-dialog-content" id="payment-form-content"></div>
    </dialog>
    <dialog class="entity-dialog payment-dialog" id="payment-details-dialog" aria-labelledby="payment-details-title">
      <div class="dialog-heading">
        <div><span class="topbar-label">Consulta</span><h2 id="payment-details-title">Detalhes do pagamento</h2></div>
        <button class="dialog-close" type="button" data-close-payment-details aria-label="Fechar">&times;</button>
      </div>
      <div class="entity-dialog-content payment-details" id="payment-details-content"></div>
    </dialog>
  `;
}

function paymentDateKey(payment) {
  const date = new Date(payment.registradoEm || payment.criadoEm);
  return Number.isNaN(date.getTime()) ? '' : localDateKey(date);
}

function initPaymentsPage() {
  const body = document.querySelector('#payments-table-body');
  if (!body) return;
  const formDialog = document.querySelector('#payment-form-dialog');
  const detailsDialog = document.querySelector('#payment-details-dialog');
  document.querySelector('#new-payment').addEventListener('click', openPaymentForm);
  document.querySelector('[data-close-payment]').addEventListener('click', () => formDialog.close());
  document.querySelector('[data-close-payment-details]').addEventListener('click', () => detailsDialog.close());
  formDialog.addEventListener('click', (event) => {
    if (event.target === formDialog) formDialog.close();
  });
  detailsDialog.addEventListener('click', (event) => {
    if (event.target === detailsDialog) detailsDialog.close();
  });
  document.querySelector('#payment-filters').addEventListener('submit', (event) => {
    event.preventDefault();
    loadPayments();
  });
  document.querySelector('#clear-payment-filters').addEventListener('click', () => {
    document.querySelector('#payment-filters').reset();
    loadPayments();
  });
  body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-payment-action="details"]');
    if (button) showPaymentDetails(button.dataset.paymentId);
  });
  loadPayments();
}

async function loadPayments() {
  const body = document.querySelector('#payments-table-body');
  const errorBox = document.querySelector('#payments-error');
  const filters = document.querySelector('#payment-filters');
  const companyId = selectedCompany?.id;
  if (!body || !filters || !companyId) return;
  const sequence = ++paymentsLoadSequence;
  const status = filters.elements.status.value;
  const date = filters.elements.data.value;
  const forma = filters.elements.forma.value;
  let endpoint = status === 'PENDENTE'
    ? '/pagamentos/pendentes'
    : status === 'REALIZADO'
      ? '/pagamentos/realizados'
      : '/pagamentos';

  if (status === 'REALIZADO' && date) {
    const start = new Date(`${date}T00:00:00`);
    const end = new Date(`${date}T23:59:59.999`);
    const params = new URLSearchParams({ inicio: start.toISOString(), fim: end.toISOString() });
    endpoint = `/pagamentos/periodo?${params.toString()}`;
  }

  errorBox.hidden = true;
  body.innerHTML = '<tr><td colspan="7"><div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando pagamentos...</span></div></td></tr>';
  try {
    const payments = await apiFetch(endpoint);
    if (!Array.isArray(payments)) throw new Error('A API retornou uma lista de pagamentos inválida.');
    if (selectedCompany?.id !== companyId || !body.isConnected || sequence !== paymentsLoadSequence) return;
    const visible = payments.filter((payment) =>
      (!date || paymentDateKey(payment) === date) &&
      (!forma || payment.forma === forma),
    );
    body.innerHTML = visible.length
      ? visible.map((payment) => `
        <tr>
          <td>${escapeHtml(formatDate(payment.registradoEm || payment.criadoEm))}</td>
          <td><strong class="table-primary">#${payment.agendamentoId}</strong><small class="payment-subtext">${escapeHtml(payment.agendamento?.profissional?.nome || 'Atendimento')}</small></td>
          <td>${escapeHtml(payment.agendamento?.cliente?.nome || 'Cliente não informado')}</td>
          <td>${escapeHtml(paymentMethods[payment.forma] || 'Não informada')}</td>
          <td>${payment.valorPago == null ? '—' : escapeHtml(formatCurrency(payment.valorPago))}</td>
          <td><span class="status-badge status-${escapeHtml(String(payment.status).toLowerCase())}">${escapeHtml(paymentStatuses[payment.status] || payment.status)}</span></td>
          <td class="table-actions"><button class="table-action" type="button" data-payment-action="details" data-payment-id="${payment.id}">Detalhes</button></td>
        </tr>
      `).join('')
      : '<tr><td colspan="7"><div class="table-state"><strong>Nenhum pagamento encontrado</strong><span>Revise os filtros ou registre um pagamento de atendimento concluído.</span></div></td></tr>';
  } catch (error) {
    if (selectedCompany?.id !== companyId || !body.isConnected || sequence !== paymentsLoadSequence) return;
    body.innerHTML = '<tr><td colspan="7"><div class="table-state">A lista de pagamentos não está disponível.</div></td></tr>';
    errorBox.innerHTML = `<span>Não foi possível carregar os pagamentos: ${escapeHtml(error.message)}</span><button class="secondary-button" type="button" id="retry-payments">Tentar novamente</button>`;
    errorBox.hidden = false;
    document.querySelector('#retry-payments').addEventListener('click', loadPayments);
  }
}

async function openPaymentForm() {
  const dialog = document.querySelector('#payment-form-dialog');
  const content = document.querySelector('#payment-form-content');
  const companyId = selectedCompany?.id;
  if (!dialog || !content || !companyId) return;
  content.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Buscando atendimentos concluídos...</span></div>';
  dialog.showModal();
  try {
    const [appointments, payments] = await Promise.all([
      apiFetch('/agendamentos/concluidos'),
      apiFetch('/pagamentos/realizados'),
    ]);
    if (selectedCompany?.id !== companyId || !dialog.open) return;
    if (!Array.isArray(appointments) || !Array.isArray(payments)) {
      throw new Error('A API retornou dados inválidos para o registro.');
    }
    const alreadyRealized = new Set(
      payments.filter((payment) => payment.status === 'REALIZADO').map((payment) => payment.agendamentoId),
    );
    const eligible = appointments.filter((appointment) =>
      appointment.status === 'CONCLUIDO' && !alreadyRealized.has(appointment.id),
    );
    renderPaymentForm(eligible, companyId);
  } catch (error) {
    content.innerHTML = `<p class="form-error">Não foi possível preparar o registro: ${escapeHtml(error.message)}</p>`;
  }
}

function renderPaymentForm(appointments, companyId) {
  const content = document.querySelector('#payment-form-content');
  const options = appointments.map((appointment) => {
    const services = (appointment.servicos || []).map((item) => item.servico?.nome).filter(Boolean).join(', ');
    const price = appointmentPrice(appointment);
    return `<option value="${appointment.id}">${escapeHtml(`${appointment.cliente?.nome || 'Cliente'} · ${agendaWallDate(appointment.inicio)} ${agendaWallTime(appointment.inicio)} · ${services || 'Serviço'} · ${formatCurrency(price)}`)}</option>`;
  }).join('');
  content.innerHTML = `
    <form class="entity-form payment-form" id="payment-form" novalidate>
      <label>Agendamento concluído
        <select name="agendamentoId" required ${appointments.length ? '' : 'disabled'}>
          <option value="">${appointments.length ? 'Selecione o atendimento' : 'Nenhum atendimento disponível para pagamento'}</option>
          ${options}
        </select>
      </label>
      <div class="payment-appointment-summary" id="payment-appointment-summary">Selecione o agendamento para consultar o cliente e o valor dos serviços.</div>
      <div class="form-grid">
        <label>Forma de pagamento
          <select name="forma" required>
            <option value="">Selecione</option>
            <option value="DINHEIRO">Dinheiro</option>
            <option value="PIX">Pix</option>
            <option value="CARTAO_DEBITO">Débito</option>
            <option value="CARTAO_CREDITO">Crédito</option>
          </select>
        </label>
        <label>Valor recebido (R$)
          <input name="valorPago" type="number" inputmode="decimal" min="0.01" step="0.01" placeholder="0,00" required />
        </label>
      </div>
      <small class="field-hint">O sistema apenas registra o recebimento; nenhum pagamento bancário será processado.</small>
      <small class="field-error" id="payment-form-error" role="alert"></small>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" data-cancel-payment>Voltar</button>
        <button class="action-button" type="submit" ${appointments.length ? '' : 'disabled'}>Registrar recebimento</button>
      </div>
    </form>
  `;
  const form = content.querySelector('#payment-form');
  const amountInput = form.elements.valorPago;
  const updateAppointmentSummary = () => {
    const appointment = appointments.find((item) => item.id === Number(form.elements.agendamentoId.value));
    if (!appointment) {
      content.querySelector('#payment-appointment-summary').textContent =
        'Selecione o agendamento para consultar o cliente e o valor dos serviços.';
      return;
    }
    const serviceNames = (appointment.servicos || []).map((item) => item.servico?.nome).filter(Boolean).join(', ');
    const amount = appointmentPrice(appointment);
    content.querySelector('#payment-appointment-summary').innerHTML = `
      <span><strong>${escapeHtml(appointment.cliente?.nome || 'Cliente não informado')}</strong><small>${escapeHtml(serviceNames || 'Serviço não informado')} · ${escapeHtml(`${agendaWallDate(appointment.inicio)} ${agendaWallTime(appointment.inicio)}`)}</small></span>
      <strong>${escapeHtml(formatCurrency(amount))}</strong>
    `;
    amountInput.value = amount > 0 ? amount.toFixed(2) : '';
  };
  form.elements.agendamentoId.addEventListener('change', updateAppointmentSummary);
  content.querySelector('[data-cancel-payment]').addEventListener('click', () => {
    document.querySelector('#payment-form-dialog').close();
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const errorBox = content.querySelector('#payment-form-error');
    errorBox.textContent = '';
    const rawAmount = amountInput.value.trim();
    const amount = Number(rawAmount);
    if (!form.elements.agendamentoId.value) {
      errorBox.textContent = 'Selecione um agendamento concluído.';
      return;
    }
    if (!/^\d+(?:\.\d{1,2})?$/.test(rawAmount) || !Number.isFinite(amount) || amount <= 0) {
      errorBox.textContent = 'Informe um valor maior que zero com no máximo duas casas decimais.';
      amountInput.focus();
      return;
    }
    if (!form.elements.forma.value) {
      errorBox.textContent = 'Selecione a forma de pagamento.';
      form.elements.forma.focus();
      return;
    }

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await apiFetch(`/pagamentos/agendamento/${form.elements.agendamentoId.value}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forma: form.elements.forma.value, valorPago: amount }),
      });
      if (selectedCompany?.id !== companyId) return;
      document.querySelector('#payment-form-dialog').close();
      showToast('Pagamento registrado com sucesso.');
      await loadPayments();
    } catch (error) {
      errorBox.textContent = `Não foi possível registrar o pagamento: ${error.message}`;
      showToast(`Falha ao registrar pagamento: ${error.message}`, 'error');
    } finally {
      if (submit.isConnected) submit.disabled = false;
    }
  });
}

async function showPaymentDetails(paymentId) {
  const dialog = document.querySelector('#payment-details-dialog');
  const content = document.querySelector('#payment-details-content');
  const companyId = selectedCompany?.id;
  content.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando detalhes...</span></div>';
  dialog.showModal();
  try {
    const payment = await apiFetch(`/pagamentos/${paymentId}`);
    if (selectedCompany?.id !== companyId || !dialog.open) return;
    const appointment = payment.agendamento || {};
    const services = (appointment.servicos || []).map((item) => item.servico?.nome).filter(Boolean).join(', ');
    content.innerHTML = `
      <dl>
        <div><dt>Situação</dt><dd><span class="status-badge status-${escapeHtml(String(payment.status).toLowerCase())}">${escapeHtml(paymentStatuses[payment.status] || payment.status)}</span></dd></div>
        <div><dt>Valor registrado</dt><dd>${payment.valorPago == null ? 'Ainda não registrado' : escapeHtml(formatCurrency(payment.valorPago))}</dd></div>
        <div><dt>Forma de pagamento</dt><dd>${escapeHtml(paymentMethods[payment.forma] || 'Não informada')}</dd></div>
        <div><dt>Registrado em</dt><dd>${escapeHtml(payment.registradoEm ? formatDateTime(payment.registradoEm) : 'Pendente')}</dd></div>
        <div><dt>Agendamento</dt><dd>#${escapeHtml(String(payment.agendamentoId))} · ${escapeHtml(`${agendaWallDate(appointment.inicio)} ${agendaWallTime(appointment.inicio)}`)}</dd></div>
        <div><dt>Cliente</dt><dd>${escapeHtml(appointment.cliente?.nome || 'Não informado')}</dd></div>
        <div><dt>Profissional</dt><dd>${escapeHtml(appointment.profissional?.nome || 'Não informado')}</dd></div>
        <div><dt>Serviços</dt><dd>${escapeHtml(services || 'Não informado')}</dd></div>
      </dl>
    `;
  } catch (error) {
    content.innerHTML = `<p class="form-error">Não foi possível consultar os detalhes: ${escapeHtml(error.message)}</p>`;
  }
}

const notificationLabels = {
  PROXIMO_AGENDAMENTO: 'Próximo agendamento',
  AGENDAMENTO_CANCELADO: 'Agendamento cancelado',
  ALTERACAO_HORARIO: 'Alteração de horário',
  PENDENTE_FINALIZACAO: 'Pendente de finalização',
};
let notificationVisibleItems = [];

function notificationsContent() {
  return `
    <div class="page-header">
      <div><h2>Notificações</h2><p>Acompanhe os avisos reais da empresa selecionada; a leitura fica salva neste navegador</p></div>
      <button class="action-button" type="button" id="refresh-notifications">Atualizar</button>
    </div>
    <div class="management-toolbar">
      <label class="search-field notification-filter">Tipo de notificação
        <select id="notification-type-filter">
          <option value="">Todas</option>
          <option value="PROXIMO_AGENDAMENTO">Próximos agendamentos</option>
          <option value="AGENDAMENTO_CANCELADO">Agendamentos cancelados</option>
          <option value="ALTERACAO_HORARIO">Alterações de horários</option>
          <option value="PENDENTE_FINALIZACAO">Pendentes de finalização</option>
        </select>
      </label>
    </div>
    <div class="management-error" id="notifications-error" role="alert" hidden></div>
    <section class="notification-list" id="notification-list" aria-live="polite">
      <div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Buscando notificações...</span></div>
    </section>
    <dialog class="entity-dialog notification-dialog" id="notification-details-dialog" aria-labelledby="notification-details-title">
      <div class="dialog-heading">
        <div><span class="topbar-label">Detalhes relacionados</span><h2 id="notification-details-title">Notificação</h2></div>
        <button class="dialog-close" type="button" data-close-notification aria-label="Fechar">&times;</button>
      </div>
      <div class="entity-dialog-content notification-details" id="notification-details-content"></div>
    </dialog>
  `;
}

function notificationDateValue(notification) {
  const data = notification.dados || {};
  if (notification.tipo === 'ALTERACAO_HORARIO') return data.criadoEm;
  if (notification.tipo === 'PENDENTE_FINALIZACAO') return data.fim || data.inicio;
  return data.inicio;
}

function notificationDateText(notification) {
  const value = notificationDateValue(notification);
  if (!value) return 'Data indisponível';
  if (notification.tipo === 'ALTERACAO_HORARIO') return `Alteração registrada em ${formatDateTime(value)}`;
  const label = notification.tipo === 'PENDENTE_FINALIZACAO' ? 'Atendimento encerrou' : 'Horário relacionado';
  return `${label}: ${agendaWallDate(value)} às ${agendaWallTime(value)}`;
}

function notificationDescription(notification) {
  const data = notification.dados || {};
  if (notification.tipo === 'ALTERACAO_HORARIO') {
    const horario = data.horario;
    const profissional = horario?.profissional?.nome;
    const dia = typeof horario?.diaSemana === 'number' ? weekDays[horario.diaSemana] : '';
    const jornada = horario ? `${horario.inicio}–${horario.fim}` : '';
    return [profissional, dia, jornada, data.mensagem].filter(Boolean).join(' · ');
  }
  return [
    data.cliente?.nome || 'Cliente não informado',
    data.profissional?.nome || 'Profissional não informado',
  ].join(' · ');
}

function initNotificationsPage() {
  const dialog = document.querySelector('#notification-details-dialog');
  document.querySelector('#refresh-notifications').addEventListener('click', () => loadNotificationCenter(true));
  document.querySelector('#notification-type-filter').addEventListener('change', renderNotificationItems);
  document.querySelector('[data-close-notification]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  document.querySelector('#notification-list').addEventListener('click', (event) => {
    const button = event.target.closest('[data-notification-index]');
    if (!button) return;
    const notification = notificationVisibleItems[Number(button.dataset.notificationIndex)];
    if (notification) showNotificationDetails(notification, selectedCompany?.id);
  });
  loadNotificationCenter();
}

async function loadNotificationCenter(forceRefresh = false) {
  const list = document.querySelector('#notification-list');
  const errorBox = document.querySelector('#notifications-error');
  const companyId = selectedCompany?.id;
  if (!list || !companyId) return;
  errorBox.hidden = true;
  list.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Buscando notificações...</span></div>';
  try {
    const notifications = await getNotifications(forceRefresh);
    if (selectedCompany?.id !== companyId || !list.isConnected) return;
    notificationCenterItems = notifications;
    renderNotificationItems();
  } catch (error) {
    if (selectedCompany?.id !== companyId || !list.isConnected) return;
    list.innerHTML = '';
    errorBox.innerHTML = `<span>Não foi possível carregar as notificações: ${escapeHtml(error.message)}</span><button class="secondary-button" type="button" id="retry-notifications">Tentar novamente</button>`;
    errorBox.hidden = false;
    document.querySelector('#retry-notifications').addEventListener('click', () => loadNotificationCenter(true));
  }
}

function renderNotificationItems() {
  const list = document.querySelector('#notification-list');
  const filter = document.querySelector('#notification-type-filter');
  const companyId = selectedCompany?.id;
  if (!list || !filter || !companyId) return;
  if (!notificationCenterItems.length) {
    notificationVisibleItems = [];
    list.innerHTML = '<div class="notification-empty"><strong>Nenhuma notificação</strong><span>Não há avisos para esta empresa no momento.</span></div>';
    updateNotificationBell();
    return;
  }

  const selectedType = filter.value;
  const visible = notificationCenterItems
    .filter((item) => !selectedType || item.tipo === selectedType)
    .sort((a, b) => new Date(notificationDateValue(b) || 0) - new Date(notificationDateValue(a) || 0));
  notificationVisibleItems = visible;
  if (!visible.length) {
    list.innerHTML = '<div class="notification-empty"><strong>Nenhum resultado</strong><span>Não há notificações desse tipo.</span></div>';
    return;
  }

  const seen = readSeenNotifications(companyId);
  list.innerHTML = visible.map((notification, index) => {
    const isNew = !seen.has(notificationKey(notification));
    const category = notificationLabels[notification.tipo] || notification.tipo || 'Notificação';
    const shortType = category.slice(0, 1);
    return `
      <article class="notification-card ${isNew ? 'notification-new' : ''}">
        <span class="notification-symbol" aria-hidden="true">${escapeHtml(shortType)}</span>
        <div class="notification-card-content">
          <div class="notification-card-heading">
            <strong>${escapeHtml(category)}</strong>
            <span class="notification-read-state">${isNew ? 'Nova' : 'Visualizada'}</span>
          </div>
          <span class="notification-description">${escapeHtml(notificationDescription(notification))}</span>
          <small>${escapeHtml(notificationDateText(notification))}</small>
        </div>
        <button class="table-action" type="button" data-notification-index="${index}">Ver detalhes</button>
      </article>
    `;
  }).join('');
  updateNotificationBell();
}

async function showNotificationDetails(notification, companyId) {
  const dialog = document.querySelector('#notification-details-dialog');
  const title = document.querySelector('#notification-details-title');
  const content = document.querySelector('#notification-details-content');
  const seen = readSeenNotifications(companyId);
  seen.add(notificationKey(notification));
  if (!saveSeenNotifications(companyId, seen)) {
    showToast('Não foi possível salvar o estado de leitura neste navegador.', 'error');
  }
  renderNotificationItems();
  updateNotificationBell();
  title.textContent = notificationLabels[notification.tipo] || 'Notificação';
  content.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando detalhes relacionados...</span></div>';
  dialog.showModal();
  try {
    if (notification.tipo === 'ALTERACAO_HORARIO') {
      const data = notification.dados || {};
      const horario = data.horario;
      const intervalos = (horario?.intervalos || []).map((item) => `${item.inicio}–${item.fim}`).join(', ');
      content.innerHTML = `
        <dl>
          <div><dt>Profissional</dt><dd>${escapeHtml(horario?.profissional?.nome || 'Não informado')}</dd></div>
          <div><dt>Dia da semana</dt><dd>${escapeHtml(typeof horario?.diaSemana === 'number' ? weekDays[horario.diaSemana] : 'Não informado')}</dd></div>
          <div><dt>Jornada atual</dt><dd>${horario ? `${escapeHtml(horario.inicio)}–${escapeHtml(horario.fim)}` : 'Horário relacionado indisponível'}</dd></div>
          <div><dt>Intervalos</dt><dd>${escapeHtml(intervalos || 'Nenhum informado')}</dd></div>
          <div><dt>Alteração registrada</dt><dd>${escapeHtml(formatDateTime(data.criadoEm))}</dd></div>
          <div><dt>Mensagem</dt><dd>${escapeHtml(data.mensagem || 'Jornada do profissional alterada')}</dd></div>
        </dl>
      `;
      return;
    }

    const appointment = await apiFetch(`/agendamentos/${notification.referenciaId}`);
    if (selectedCompany?.id !== companyId || !dialog.open) return;
    const services = appointmentServiceNames(appointment);
    content.innerHTML = `
      <dl>
        <div><dt>Data e horário</dt><dd>${escapeHtml(`${agendaWallDate(appointment.inicio)} às ${agendaWallTime(appointment.inicio)}`)}</dd></div>
        <div><dt>Cliente</dt><dd>${escapeHtml(appointment.cliente?.nome || 'Não informado')}</dd></div>
        <div><dt>Telefone</dt><dd>${escapeHtml(appointment.cliente?.telefone || 'Não informado')}</dd></div>
        <div><dt>Profissional</dt><dd>${escapeHtml(appointment.profissional?.nome || 'Não informado')}</dd></div>
        <div><dt>Serviços</dt><dd>${escapeHtml(services || 'Não informado')}</dd></div>
        <div><dt>Situação atual</dt><dd>${escapeHtml(appointmentStatusLabels[appointment.status] || appointment.status)}</dd></div>
        <div><dt>Tipo do aviso</dt><dd>${escapeHtml(notificationLabels[notification.tipo] || notification.tipo)}</dd></div>
      </dl>
    `;
  } catch (error) {
    content.innerHTML = `<p class="form-error">Não foi possível carregar os detalhes: ${escapeHtml(error.message)}</p>`;
  }
}

let reportsLoadSequence = 0;

function reportsContent() {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  return `
    <div class="page-header">
      <div><h2>Relatórios</h2><p>Indicadores da empresa no período selecionado</p></div>
      <button class="secondary-button" type="button" id="refresh-reports">Atualizar</button>
    </div>
    <div class="management-toolbar">
      <form class="report-filters" id="report-filters">
        <label class="search-field">De
          <input type="date" name="inicio" required value="${localDateKey(monthStart)}" />
        </label>
        <label class="search-field">Até
          <input type="date" name="fim" required value="${localDateKey(today)}" />
        </label>
        <div class="toolbar-actions">
          <button class="action-button" type="submit">Consultar período</button>
        </div>
      </form>
      <div class="report-presets" aria-label="Períodos rápidos">
        <button class="table-action" type="button" data-report-days="0">Hoje</button>
        <button class="table-action" type="button" data-report-days="7">Últimos 7 dias</button>
        <button class="table-action" type="button" data-report-days="30">Últimos 30 dias</button>
        <button class="table-action" type="button" data-report-days="month">Este mês</button>
      </div>
    </div>
    <div class="management-error" id="reports-error" role="alert" hidden></div>
    <div class="report-period-label" id="report-period-label" aria-live="polite"></div>
    <p class="report-empty-note" id="report-empty-note" hidden></p>
    <div class="report-indicators" id="report-indicators" aria-live="polite">
      ${['Atendimentos', 'Pagamentos registrados', 'Cancelamentos']
        .map((label) => `<article class="card report-indicator"><h3>${label}</h3><p class="card-value"><span class="spinner" aria-label="Carregando"></span></p></article>`)
        .join('')}
    </div>
    <div class="report-charts" id="report-charts">
      <section class="report-chart-panel"><div class="report-chart-heading"><h3>Serviços mais realizados</h3><span>Atendimentos concluídos</span></div><div class="report-chart-content table-state"><span class="spinner" aria-label="Carregando"></span><span>Buscando dados...</span></div></section>
      <section class="report-chart-panel"><div class="report-chart-heading"><h3>Profissionais com mais atendimentos</h3><span>Atendimentos concluídos</span></div><div class="report-chart-content table-state"><span class="spinner" aria-label="Carregando"></span><span>Buscando dados...</span></div></section>
    </div>
  `;
}

function initReportsPage() {
  const form = document.querySelector('#report-filters');
  if (!form) return;
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    loadReports();
  });
  document.querySelector('#refresh-reports').addEventListener('click', loadReports);
  document.querySelectorAll('[data-report-days]').forEach((button) => {
    button.addEventListener('click', () => {
      const end = new Date();
      const range = button.dataset.reportDays;
      const start = new Date(end);
      if (range === 'month') {
        start.setDate(1);
      } else {
        start.setDate(start.getDate() - Math.max(0, Number(range) - 1));
      }
      form.elements.inicio.value = localDateKey(start);
      form.elements.fim.value = localDateKey(end);
      loadReports();
    });
  });
  loadReports();
}

function isValidReport(report) {
  return report &&
    Number.isInteger(report.atendimentos) &&
    report.atendimentos >= 0 &&
    Number.isInteger(report.cancelamentos) &&
    report.cancelamentos >= 0 &&
    report.pagamentos &&
    Number.isInteger(report.pagamentos.quantidade) &&
    report.pagamentos.quantidade >= 0 &&
    Number.isFinite(report.pagamentos.total) &&
    report.pagamentos.total >= 0 &&
    Array.isArray(report.servicosMaisRealizados) &&
    report.servicosMaisRealizados.every((item) =>
      item && typeof item.nome === 'string' && Number.isInteger(item.quantidade) && item.quantidade >= 0,
    ) &&
    Array.isArray(report.profissionaisComMaisAtendimentos) &&
    report.profissionaisComMaisAtendimentos.every((item) =>
      item && typeof item.nome === 'string' && Number.isInteger(item.atendimentos) && item.atendimentos >= 0,
    );
}

function renderReportBars(items, labelKey, valueKey, emptyMessage) {
  if (!items.length) return `<div class="report-chart-empty">${escapeHtml(emptyMessage)}</div>`;
  const values = items.map((item) => Number(item[valueKey]));
  const maxValue = Math.max(...values);
  return `<ol class="report-bars">${items.map((item, index) => {
    const value = values[index];
    const width = maxValue > 0 ? Math.max(0, Math.min(100, (value / maxValue) * 100)) : 0;
    return `
      <li class="report-bar-row">
        <div class="report-bar-label"><span>${escapeHtml(item[labelKey])}</span><strong>${escapeHtml(String(value))}</strong></div>
        <div class="report-bar-track" role="img" aria-label="${escapeHtml(`${item[labelKey]}: ${value}`)}">
          <span style="width: ${width}%"></span>
        </div>
      </li>
    `;
  }).join('')}</ol>`;
}

async function loadReports() {
  const form = document.querySelector('#report-filters');
  const errorBox = document.querySelector('#reports-error');
  const indicators = document.querySelector('#report-indicators');
  const charts = document.querySelector('#report-charts');
  const periodLabel = document.querySelector('#report-period-label');
  const emptyNote = document.querySelector('#report-empty-note');
  const companyId = selectedCompany?.id;
  if (!form || !companyId) return;
  const inicio = form.elements.inicio.value;
  const fim = form.elements.fim.value;
  const sequence = ++reportsLoadSequence;
  const submit = form.querySelector('[type="submit"]');
  errorBox.hidden = true;
  emptyNote.hidden = true;
  emptyNote.textContent = '';
  if (!inicio || !fim || inicio > fim) {
    submit.disabled = false;
    errorBox.textContent = 'Informe um período válido. A data inicial deve ser anterior ou igual à data final.';
    errorBox.hidden = false;
    periodLabel.textContent = '';
    indicators.innerHTML = '';
    charts.querySelectorAll('.report-chart-content').forEach((panel) => {
      panel.className = 'report-chart-content';
      panel.textContent = 'Informe um período válido.';
    });
    return;
  }
  submit.disabled = true;
  periodLabel.textContent = '';
  indicators.innerHTML = ['Atendimentos', 'Pagamentos registrados', 'Cancelamentos']
    .map((label) => `<article class="card report-indicator"><h3>${label}</h3><p class="card-value"><span class="spinner" aria-label="Carregando"></span></p></article>`)
    .join('');
  charts.querySelectorAll('.report-chart-content').forEach((panel) => {
    panel.className = 'report-chart-content table-state';
    panel.innerHTML = '<span class="spinner" aria-label="Carregando"></span><span>Buscando dados...</span>';
  });
  try {
    const params = new URLSearchParams({ inicio, fim });
    const report = await apiFetch(`/relatorios?${params.toString()}`);
    if (!isValidReport(report)) throw new Error('A API retornou dados inválidos para o relatório.');
    if (selectedCompany?.id !== companyId || !form.isConnected || sequence !== reportsLoadSequence) return;

    const hasRecords = report.atendimentos > 0 ||
      report.cancelamentos > 0 ||
      report.pagamentos.quantidade > 0 ||
      report.servicosMaisRealizados.length > 0 ||
      report.profissionaisComMaisAtendimentos.length > 0;
    periodLabel.textContent = `Período: ${formatDate(`${inicio}T00:00:00`)} a ${formatDate(`${fim}T00:00:00`)}`;
    indicators.innerHTML = `
      <article class="card report-indicator">
        <h3>Atendimentos</h3>
        <p class="card-value">${escapeHtml(String(report.atendimentos))}</p>
        <span>Registros no período</span>
      </article>
      <article class="card report-indicator report-payment-indicator">
        <h3>Total de pagamentos</h3>
        <p class="card-value">${escapeHtml(formatCurrency(report.pagamentos.total))}</p>
        <span>${escapeHtml(String(report.pagamentos.quantidade))} pagamento(s) registrado(s)</span>
      </article>
      <article class="card report-indicator report-cancellation-indicator">
        <h3>Cancelamentos</h3>
        <p class="card-value">${escapeHtml(String(report.cancelamentos))}</p>
        <span>Agendamentos cancelados no período</span>
      </article>
    `;
    const panels = charts.querySelectorAll('.report-chart-content');
    panels[0].className = 'report-chart-content';
    panels[0].innerHTML = renderReportBars(
      report.servicosMaisRealizados,
      'nome',
      'quantidade',
      'Nenhum serviço concluído neste período.',
    );
    panels[1].className = 'report-chart-content';
    panels[1].innerHTML = renderReportBars(
      report.profissionaisComMaisAtendimentos,
      'nome',
      'atendimentos',
      'Nenhum atendimento concluído neste período.',
    );
    charts.classList.toggle('report-charts-empty', !hasRecords);
    if (!hasRecords) {
      emptyNote.textContent = 'Não há registros para o período selecionado.';
      emptyNote.hidden = false;
    }
  } catch (error) {
    if (selectedCompany?.id !== companyId || !form.isConnected || sequence !== reportsLoadSequence) return;
    indicators.innerHTML = '';
    charts.querySelectorAll('.report-chart-content').forEach((panel) => {
      panel.className = 'report-chart-content';
      panel.textContent = 'Dados indisponíveis.';
    });
    errorBox.innerHTML = `<span>Não foi possível carregar o relatório: ${escapeHtml(error.message)}</span><button class="secondary-button" type="button" id="retry-reports">Tentar novamente</button>`;
    errorBox.hidden = false;
    document.querySelector('#retry-reports').addEventListener('click', loadReports);
  } finally {
    if (submit.isConnected && sequence === reportsLoadSequence) submit.disabled = false;
  }
}

function clientsContent() {
  return `
    <div class="page-header">
      <div><h2>Clientes</h2><p>Consulte e mantenha os cadastros da empresa</p></div>
      <button class="action-button" type="button" id="new-client">+ Novo cliente</button>
    </div>
    <div class="management-toolbar">
      <form class="client-search-form" id="client-search-form">
        <label class="search-field">
          <span>Pesquisar por nome</span>
          <input type="search" id="client-name-filter" placeholder="Nome do cliente" autocomplete="off" />
        </label>
        <label class="search-field">
          <span>Pesquisar por telefone</span>
          <input type="search" id="client-phone-filter" placeholder="Somente números ou telefone" inputmode="tel" autocomplete="off" />
        </label>
        <div class="toolbar-actions">
          <button class="action-button" type="submit">Pesquisar</button>
          <button class="secondary-button" type="button" id="clear-client-search">Limpar</button>
        </div>
      </form>
    </div>
    <div class="management-error" id="clients-error" role="alert" hidden></div>
    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table">
          <thead><tr><th>Nome</th><th>Telefone</th><th>Cadastro</th><th class="actions-column">Ações</th></tr></thead>
          <tbody id="clients-table-body">
            <tr><td colspan="4"><div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando clientes...</span></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <dialog class="entity-dialog" id="client-dialog" aria-labelledby="client-dialog-title">
      <div class="dialog-heading">
        <div><span class="topbar-label">Cadastro de cliente</span><h2 id="client-dialog-title"></h2></div>
        <button class="dialog-close" type="button" data-close-client aria-label="Fechar">&times;</button>
      </div>
      <div class="entity-dialog-content" id="client-dialog-content"></div>
    </dialog>
  `;
}

let toastTimeout;

function showToast(message, type = 'success') {
  const region = document.querySelector('#toast-region');
  region.innerHTML = '';
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  region.append(toast);
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.remove(), 4500);
}

function confirmAction(title, message) {
  const dialog = document.querySelector('#confirmation-dialog');
  const titleElement = document.querySelector('#confirmation-title');
  const messageElement = document.querySelector('#confirmation-message');
  const confirmButton = document.querySelector('#confirmation-confirm');
  const cancelButton = document.querySelector('#confirmation-cancel');

  titleElement.textContent = title;
  messageElement.textContent = message;
  dialog.showModal();

  return new Promise((resolve) => {
    const cleanup = (confirmed) => {
      confirmButton.removeEventListener('click', onConfirm);
      cancelButton.removeEventListener('click', onCancel);
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('click', onBackdrop);
      dialog.close();
      resolve(confirmed);
    };
    const onConfirm = () => cleanup(true);
    const onCancel = () => cleanup(false);
    const onBackdrop = (event) => {
      if (event.target === dialog) onCancel();
    };

    confirmButton.addEventListener('click', onConfirm);
    cancelButton.addEventListener('click', onCancel);
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('click', onBackdrop);
  });
}

function formatPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 11) return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10) return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return phone || 'Não informado';
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function initClientsPage() {
  const page = document.querySelector('#clients-table-body');
  if (!page) return;

  const dialog = document.querySelector('#client-dialog');
  document.querySelector('#new-client').addEventListener('click', () => openClientForm());
  document.querySelector('[data-close-client]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });

  document.querySelector('#client-search-form').addEventListener('submit', (event) => {
    event.preventDefault();
    loadClients();
  });
  document.querySelector('#clear-client-search').addEventListener('click', () => {
    document.querySelector('#client-name-filter').value = '';
    document.querySelector('#client-phone-filter').value = '';
    loadClients();
  });
  document.querySelector('#clients-table-body').addEventListener('click', (event) => {
    const button = event.target.closest('[data-client-action]');
    if (!button) return;
    const { clientAction, clientId } = button.dataset;
    if (clientAction === 'view') showClientDetails(clientId);
    if (clientAction === 'edit') openClientForm({ id: Number(clientId) });
  });

  loadClients();
}

async function loadClients() {
  const body = document.querySelector('#clients-table-body');
  const error = document.querySelector('#clients-error');
  if (!body || !selectedCompany?.id) return;
  const companyId = selectedCompany.id;
  const params = new URLSearchParams();
  const name = document.querySelector('#client-name-filter').value.trim();
  const phone = document.querySelector('#client-phone-filter').value.replace(/\D/g, '');
  if (name) params.set('nome', name);
  if (phone) params.set('telefone', phone);

  error.hidden = true;
  body.innerHTML = '<tr><td colspan="4"><div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando clientes...</span></div></td></tr>';

  try {
    const query = params.toString();
    const clients = await apiFetch(`/clientes${query ? `?${query}` : ''}`);
    if (!Array.isArray(clients)) throw new Error('A API retornou uma lista de clientes inválida.');
    if (selectedCompany?.id !== companyId || !body.isConnected) return;

    body.innerHTML = clients.length
      ? clients.map((client) => `
        <tr>
          <td><strong class="table-primary">${escapeHtml(client.nome)}</strong></td>
          <td>${escapeHtml(formatPhone(client.telefone))}</td>
          <td>${escapeHtml(formatDate(client.criadoEm))}</td>
          <td class="table-actions">
            <button class="table-action" type="button" data-client-action="view" data-client-id="${client.id}">Consultar</button>
            <button class="table-action" type="button" data-client-action="edit" data-client-id="${client.id}">Editar</button>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="4"><div class="table-state"><strong>Nenhum cliente encontrado</strong><span>Altere os filtros ou cadastre um novo cliente.</span></div></td></tr>';
  } catch (requestError) {
    if (selectedCompany?.id !== companyId || !body.isConnected) return;
    body.innerHTML = '<tr><td colspan="4"><div class="table-state">A lista não está disponível.</div></td></tr>';
    error.innerHTML = `<span>Não foi possível carregar os clientes: ${escapeHtml(requestError.message)}</span><button class="secondary-button" type="button" id="retry-clients">Tentar novamente</button>`;
    error.hidden = false;
    document.querySelector('#retry-clients').addEventListener('click', loadClients);
  }
}

async function openClientForm(client = null) {
  const dialog = document.querySelector('#client-dialog');
  const title = document.querySelector('#client-dialog-title');
  const content = document.querySelector('#client-dialog-content');
  let current = client;

  if (client?.id) {
    title.textContent = 'Editar cliente';
    content.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando dados...</span></div>';
    if (!dialog.open) dialog.showModal();
    try {
      current = await apiFetch(`/clientes/${client.id}`);
    } catch (error) {
      content.innerHTML = `<p class="form-error">Não foi possível carregar o cliente: ${escapeHtml(error.message)}</p>`;
      return;
    }
  } else {
    title.textContent = 'Novo cliente';
    current = null;
  }

  content.innerHTML = `
    <form class="entity-form" id="client-form" novalidate>
      <label>Nome completo
        <input name="nome" required maxlength="191" autocomplete="name" value="${escapeHtml(current?.nome || '')}" />
        <small class="field-error" data-error="nome"></small>
      </label>
      <label>Telefone com DDD
        <input name="telefone" type="tel" required inputmode="tel" autocomplete="tel" placeholder="11987654321" value="${escapeHtml(current?.telefone || '')}" />
        <small class="field-error" data-error="telefone"></small>
        <small class="field-hint">Informe 10 ou 11 dígitos, incluindo o DDD.</small>
      </label>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" data-close-form>Cancelar</button>
        <button class="action-button" type="submit">${current ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
      </div>
    </form>
  `;

  content.querySelector('[data-close-form]').addEventListener('click', () => dialog.close());
  content.querySelector('#client-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      nome: String(formData.get('nome') || '').trim(),
      telefone: String(formData.get('telefone') || '').replace(/\D/g, ''),
    };
    const errors = {
      nome: !payload.nome ? 'Informe o nome do cliente.' : '',
      telefone: !/^\d{10,11}$/.test(payload.telefone) ? 'Use DDD e número, somente dígitos (10 ou 11).' : '',
    };
    Object.entries(errors).forEach(([field, message]) => {
      form.querySelector(`[data-error="${field}"]`).textContent = message;
    });
    if (Object.values(errors).some(Boolean)) return;

    const confirmed = await confirmAction(
      current ? 'Confirmar alteração' : 'Confirmar cadastro',
      current ? `Salvar as alterações do cadastro de ${payload.nome}?` : `Cadastrar ${payload.nome} nesta empresa?`,
    );
    if (!confirmed) return;

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await apiFetch(current ? `/clientes/${current.id}` : '/clientes', {
        method: current ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      dialog.close();
      showToast(current ? 'Cliente atualizado com sucesso.' : 'Cliente cadastrado com sucesso.');
      await loadClients();
    } catch (error) {
      showToast(`Não foi possível salvar o cliente: ${error.message}`, 'error');
    } finally {
      if (submit.isConnected) submit.disabled = false;
    }
  });

  if (!dialog.open) dialog.showModal();
}

async function showClientDetails(clientId) {
  const dialog = document.querySelector('#client-dialog');
  const title = document.querySelector('#client-dialog-title');
  const content = document.querySelector('#client-dialog-content');
  title.textContent = 'Informações do cliente';
  content.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando informações...</span></div>';
  dialog.showModal();

  try {
    const client = await apiFetch(`/clientes/${clientId}`);
    title.textContent = client.nome;
    content.innerHTML = `
      <div class="client-details">
        <dl>
          <div><dt>Nome</dt><dd>${escapeHtml(client.nome)}</dd></div>
          <div><dt>Telefone</dt><dd>${escapeHtml(formatPhone(client.telefone))}</dd></div>
          <div><dt>Cadastrado em</dt><dd>${escapeHtml(formatDate(client.criadoEm))}</dd></div>
        </dl>
        <div class="dialog-actions">
          <button class="secondary-button" type="button" id="client-history">Histórico de agendamentos</button>
          <button class="action-button" type="button" id="edit-client-detail">Editar</button>
        </div>
        <div id="client-history-content"></div>
      </div>
    `;
    content.querySelector('#client-history').addEventListener('click', () => loadClientHistory(client.id));
    content.querySelector('#edit-client-detail').addEventListener('click', () => openClientForm(client));
  } catch (error) {
    content.innerHTML = `<p class="form-error">Não foi possível consultar o cliente: ${escapeHtml(error.message)}</p>`;
  }
}

async function loadClientHistory(clientId) {
  const history = document.querySelector('#client-history-content');
  history.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando histórico...</span></div>';
  try {
    const appointments = await apiFetch(`/agendamentos/historico/cliente/${clientId}`);
    if (!Array.isArray(appointments)) throw new Error('A API retornou um histórico inválido.');
    history.innerHTML = appointments.length
      ? `<h3>Agendamentos anteriores</h3><div class="history-list">${appointments.map((appointment) => `
          <article class="history-item">
            <div><strong>${escapeHtml(formatDate(appointment.inicio))}</strong><span>${escapeHtml(appointment.profissional?.nome || 'Profissional não informado')}</span></div>
            <span class="status-badge status-${String(appointment.status).toLowerCase()}">${escapeHtml(appointmentStatusLabels[appointment.status] || appointment.status)}</span>
          </article>
        `).join('')}</div>`
      : '<div class="table-state"><strong>Nenhum agendamento no histórico</strong></div>';
  } catch (error) {
    history.innerHTML = `<p class="form-error">Não foi possível carregar o histórico: ${escapeHtml(error.message)}</p>`;
  }
}

const weekDays = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];

function professionalsContent() {
  return `
    <div class="page-header">
      <div><h2>Profissionais</h2><p>Gerencie a equipe e consulte jornadas e agendas</p></div>
      <button class="action-button" type="button" id="new-professional">+ Novo profissional</button>
    </div>
    <div class="management-error" id="professionals-error" role="alert" hidden></div>
    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table professionals-table">
          <thead><tr><th>Nome</th><th>Telefone</th><th>Situação</th><th>Horários de trabalho</th><th class="actions-column">Ações</th></tr></thead>
          <tbody id="professionals-table-body">
            <tr><td colspan="5"><div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando profissionais...</span></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <dialog class="entity-dialog" id="professional-dialog" aria-labelledby="professional-dialog-title">
      <div class="dialog-heading">
        <div><span class="topbar-label">Equipe</span><h2 id="professional-dialog-title"></h2></div>
        <button class="dialog-close" type="button" data-close-professional aria-label="Fechar">&times;</button>
      </div>
      <div class="entity-dialog-content" id="professional-dialog-content"></div>
    </dialog>
  `;
}

function initProfessionalsPage() {
  const body = document.querySelector('#professionals-table-body');
  if (!body) return;
  const dialog = document.querySelector('#professional-dialog');
  document.querySelector('#new-professional').addEventListener('click', () => openProfessionalForm());
  document.querySelector('[data-close-professional]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-professional-action]');
    if (!button) return;
    const { professionalAction, professionalId } = button.dataset;
    if (professionalAction === 'view') showProfessionalDetails(professionalId);
    if (professionalAction === 'edit') openProfessionalForm({ id: Number(professionalId) });
    if (professionalAction === 'toggle') toggleProfessional(professionalId, button.dataset.active === 'true');
    if (professionalAction === 'agenda') showProfessionalAgenda(professionalId);
  });
  loadProfessionals();
}

function formatWorkSchedule(hours) {
  if (!hours?.length) return 'Jornada não definida';
  return hours.map((schedule) =>
    `${weekDays[schedule.diaSemana] || 'Dia não informado'} ${schedule.inicio}–${schedule.fim}`,
  ).join(' · ');
}

async function loadProfessionals() {
  const body = document.querySelector('#professionals-table-body');
  const error = document.querySelector('#professionals-error');
  if (!body || !selectedCompany?.id) return;
  const companyId = selectedCompany.id;
  error.hidden = true;
  body.innerHTML = '<tr><td colspan="5"><div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando profissionais...</span></div></td></tr>';

  try {
    const professionals = await apiFetch('/profissionais');
    if (!Array.isArray(professionals)) throw new Error('A API retornou uma lista de profissionais inválida.');
    const entries = await Promise.all(professionals.map(async (professional) => ({
      professional,
      journey: await apiFetch(`/profissionais/${professional.id}/jornada`),
    })));
    if (selectedCompany?.id !== companyId || !body.isConnected) return;

    body.innerHTML = entries.length
      ? entries.map(({ professional, journey }) => `
        <tr>
          <td><strong class="table-primary">${escapeHtml(professional.nome)}</strong></td>
          <td>${escapeHtml(formatPhone(professional.telefone))}</td>
          <td><span class="status-badge status-${professional.ativo ? 'ativo' : 'inativo'}">${professional.ativo ? 'Ativo' : 'Inativo'}</span></td>
          <td class="schedule-cell">${escapeHtml(formatWorkSchedule(journey.horarios))}</td>
          <td class="table-actions">
            <button class="table-action" type="button" data-professional-action="view" data-professional-id="${professional.id}">Consultar</button>
            <button class="table-action" type="button" data-professional-action="agenda" data-professional-id="${professional.id}">Agenda</button>
            <button class="table-action" type="button" data-professional-action="edit" data-professional-id="${professional.id}">Editar</button>
            <button class="table-action" type="button" data-professional-action="toggle" data-professional-id="${professional.id}" data-active="${professional.ativo}">${professional.ativo ? 'Desativar' : 'Ativar'}</button>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="5"><div class="table-state"><strong>Nenhum profissional cadastrado</strong><span>Cadastre um profissional para começar.</span></div></td></tr>';
  } catch (requestError) {
    if (selectedCompany?.id !== companyId || !body.isConnected) return;
    body.innerHTML = '<tr><td colspan="5"><div class="table-state">A lista não está disponível.</div></td></tr>';
    error.innerHTML = `<span>Não foi possível carregar os profissionais: ${escapeHtml(requestError.message)}</span><button class="secondary-button" type="button" id="retry-professionals">Tentar novamente</button>`;
    error.hidden = false;
    document.querySelector('#retry-professionals').addEventListener('click', loadProfessionals);
  }
}

async function openProfessionalForm(professional = null) {
  const dialog = document.querySelector('#professional-dialog');
  const title = document.querySelector('#professional-dialog-title');
  const content = document.querySelector('#professional-dialog-content');
  let current = professional;

  if (professional?.id) {
    title.textContent = 'Editar profissional';
    content.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando dados...</span></div>';
    if (!dialog.open) dialog.showModal();
    try {
      current = await apiFetch(`/profissionais/${professional.id}`);
    } catch (error) {
      content.innerHTML = `<p class="form-error">Não foi possível carregar o profissional: ${escapeHtml(error.message)}</p>`;
      return;
    }
  } else {
    title.textContent = 'Novo profissional';
    current = null;
  }

  content.innerHTML = `
    <form class="entity-form" id="professional-form" novalidate>
      <label>Nome completo
        <input name="nome" required maxlength="191" autocomplete="name" value="${escapeHtml(current?.nome || '')}" />
        <small class="field-error" data-error="nome"></small>
      </label>
      <label>Telefone com DDD
        <input name="telefone" type="tel" required inputmode="tel" autocomplete="tel" placeholder="11987654321" value="${escapeHtml(current?.telefone || '')}" />
        <small class="field-error" data-error="telefone"></small>
        <small class="field-hint">Informe 10 ou 11 dígitos, incluindo o DDD.</small>
      </label>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" data-close-form>Cancelar</button>
        <button class="action-button" type="submit">${current ? 'Salvar alterações' : 'Cadastrar profissional'}</button>
      </div>
    </form>
  `;
  if (!dialog.open) dialog.showModal();

  content.querySelector('[data-close-form]').addEventListener('click', () => dialog.close());
  content.querySelector('#professional-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const payload = {
      nome: String(formData.get('nome') || '').trim(),
      telefone: String(formData.get('telefone') || '').replace(/\D/g, ''),
    };
    const errors = {
      nome: !payload.nome ? 'Informe o nome do profissional.' : '',
      telefone: !/^\d{10,11}$/.test(payload.telefone) ? 'Use DDD e número, somente dígitos (10 ou 11).' : '',
    };
    Object.entries(errors).forEach(([field, message]) => {
      form.querySelector(`[data-error="${field}"]`).textContent = message;
    });
    if (Object.values(errors).some(Boolean)) return;

    const confirmed = await confirmAction(
      current ? 'Confirmar alteração' : 'Confirmar cadastro',
      current ? `Salvar as alterações do profissional ${payload.nome}?` : `Cadastrar ${payload.nome} nesta empresa?`,
    );
    if (!confirmed) return;

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await apiFetch(current ? `/profissionais/${current.id}` : '/profissionais', {
        method: current ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      dialog.close();
      showToast(current ? 'Profissional atualizado com sucesso.' : 'Profissional cadastrado com sucesso.');
      await loadProfessionals();
    } catch (error) {
      showToast(`Não foi possível salvar o profissional: ${error.message}`, 'error');
    } finally {
      if (submit.isConnected) submit.disabled = false;
    }
  });
}

async function toggleProfessional(professionalId, active) {
  const confirmed = await confirmAction(
    active ? 'Desativar profissional' : 'Ativar profissional',
    `Confirma ${active ? 'desativar' : 'ativar'} este profissional? O histórico será mantido.`,
  );
  if (!confirmed) return;

  try {
    await apiFetch(`/profissionais/${professionalId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !active }),
    });
    showToast(`Profissional ${active ? 'desativado' : 'ativado'} com sucesso.`);
    await loadProfessionals();
  } catch (error) {
    showToast(`Não foi possível atualizar a situação: ${error.message}`, 'error');
  }
}

async function showProfessionalDetails(professionalId) {
  const dialog = document.querySelector('#professional-dialog');
  const title = document.querySelector('#professional-dialog-title');
  const content = document.querySelector('#professional-dialog-content');
  content.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando informações...</span></div>';
  dialog.showModal();

  try {
    const [professional, journey] = await Promise.all([
      apiFetch(`/profissionais/${professionalId}`),
      apiFetch(`/profissionais/${professionalId}/jornada`),
    ]);
    title.textContent = professional.nome;
    content.innerHTML = `
      <div class="entity-details">
        <dl>
          <div><dt>Nome</dt><dd>${escapeHtml(professional.nome)}</dd></div>
          <div><dt>Telefone</dt><dd>${escapeHtml(formatPhone(professional.telefone))}</dd></div>
          <div><dt>Situação</dt><dd>${professional.ativo ? 'Ativo' : 'Inativo'}</dd></div>
          <div><dt>Horários de trabalho</dt><dd>${escapeHtml(formatWorkSchedule(journey.horarios))}</dd></div>
        </dl>
        <div class="dialog-actions">
          <button class="secondary-button" type="button" id="professional-agenda">Acessar agenda</button>
          <button class="action-button" type="button" id="edit-professional-detail">Editar</button>
        </div>
      </div>
    `;
    content.querySelector('#professional-agenda').addEventListener('click', () => showProfessionalAgenda(professional.id));
    content.querySelector('#edit-professional-detail').addEventListener('click', () => openProfessionalForm(professional));
  } catch (error) {
    content.innerHTML = `<p class="form-error">Não foi possível consultar o profissional: ${escapeHtml(error.message)}</p>`;
  }
}

async function showProfessionalAgenda(professionalId) {
  const dialog = document.querySelector('#professional-dialog');
  const title = document.querySelector('#professional-dialog-title');
  const content = document.querySelector('#professional-dialog-content');
  title.textContent = 'Agenda individual';
  content.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando profissional...</span></div>';
  if (!dialog.open) dialog.showModal();

  try {
    const [professional, journey] = await Promise.all([
      apiFetch(`/profissionais/${professionalId}`),
      apiFetch(`/profissionais/${professionalId}/jornada`),
    ]);
    title.textContent = `Agenda · ${professional.nome}`;
    content.innerHTML = `
      <div class="agenda-schedule"><strong>Jornada semanal</strong><span>${escapeHtml(formatWorkSchedule(journey.horarios))}</span></div>
      <form class="agenda-date-form" id="professional-agenda-form">
        <label>Data da agenda<input type="date" name="data" required value="${localDateKey(new Date())}" /></label>
        <button class="action-button" type="submit">Consultar agenda</button>
      </form>
      <div id="professional-agenda-results" class="agenda-results"></div>
    `;
    const dateInput = content.querySelector('[name="data"]');
    const form = content.querySelector('#professional-agenda-form');
    const refreshAgenda = () => loadProfessionalAgenda(professionalId, dateInput.value);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      refreshAgenda();
    });
    refreshAgenda();
  } catch (error) {
    content.innerHTML = `<p class="form-error">Não foi possível carregar a agenda: ${escapeHtml(error.message)}</p>`;
  }
}

async function loadProfessionalAgenda(professionalId, date) {
  const results = document.querySelector('#professional-agenda-results');
  if (!results) return;
  results.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando agenda...</span></div>';
  try {
    const appointments = await apiFetch(`/agendamentos?profissionalId=${professionalId}&data=${encodeURIComponent(date)}`);
    if (!Array.isArray(appointments)) throw new Error('A API retornou uma agenda inválida.');
    results.innerHTML = appointments.length
      ? `<div class="history-list">${appointments.map((appointment) => `
          <article class="history-item">
            <div><strong>${escapeHtml(formatTime(appointment.inicio))} · ${escapeHtml(appointment.cliente?.nome || 'Cliente não informado')}</strong><span>${escapeHtml(appointment.servicos?.map((item) => item.servico?.nome).filter(Boolean).join(', ') || 'Serviço não informado')}</span></div>
            <span class="status-badge status-${String(appointment.status).toLowerCase()}">${escapeHtml(appointmentStatusLabels[appointment.status] || appointment.status)}</span>
          </article>
        `).join('')}</div>`
      : '<div class="table-state"><strong>Nenhum agendamento nesta data</strong></div>';
  } catch (error) {
    results.innerHTML = `<p class="form-error">Não foi possível carregar os agendamentos: ${escapeHtml(error.message)}</p>`;
  }
}

function servicesContent() {
  return `
    <div class="page-header">
      <div><h2>Serviços</h2><p>Gerencie valores, duração e disponibilidade do catálogo</p></div>
      <button class="action-button" type="button" id="new-service">+ Novo serviço</button>
    </div>
    <p class="service-price-note">Alterações no preço do serviço são aplicadas a novos agendamentos; os valores já registrados permanecem preservados.</p>
    <div class="management-error" id="services-error" role="alert" hidden></div>
    <div class="table-card">
      <div class="table-scroll">
        <table class="data-table services-table">
          <thead><tr><th>Nome</th><th>Descrição</th><th>Preço</th><th>Duração</th><th>Situação</th><th class="actions-column">Ações</th></tr></thead>
          <tbody id="services-table-body">
            <tr><td colspan="6"><div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando serviços...</span></div></td></tr>
          </tbody>
        </table>
      </div>
    </div>
    <dialog class="entity-dialog" id="service-dialog" aria-labelledby="service-dialog-title">
      <div class="dialog-heading">
        <div><span class="topbar-label">Catálogo</span><h2 id="service-dialog-title"></h2></div>
        <button class="dialog-close" type="button" data-close-service aria-label="Fechar">&times;</button>
      </div>
      <div class="entity-dialog-content" id="service-dialog-content"></div>
    </dialog>
  `;
}

function formatCurrency(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount)
    : 'Valor indisponível';
}

function initServicesPage() {
  const body = document.querySelector('#services-table-body');
  if (!body) return;
  const dialog = document.querySelector('#service-dialog');
  document.querySelector('#new-service').addEventListener('click', () => openServiceForm());
  document.querySelector('[data-close-service]').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  body.addEventListener('click', (event) => {
    const button = event.target.closest('[data-service-action]');
    if (!button) return;
    const { serviceAction, serviceId } = button.dataset;
    if (serviceAction === 'view') showServiceDetails(serviceId);
    if (serviceAction === 'edit') openServiceForm({ id: Number(serviceId) });
    if (serviceAction === 'toggle') toggleService(serviceId, button.dataset.active === 'true');
  });
  loadServices();
}

async function loadServices() {
  const body = document.querySelector('#services-table-body');
  const error = document.querySelector('#services-error');
  if (!body || !selectedCompany?.id) return;
  const companyId = selectedCompany.id;
  error.hidden = true;
  body.innerHTML = '<tr><td colspan="6"><div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando serviços...</span></div></td></tr>';

  try {
    const services = await apiFetch('/servicos');
    if (!Array.isArray(services)) throw new Error('A API retornou uma lista de serviços inválida.');
    if (selectedCompany?.id !== companyId || !body.isConnected) return;

    body.innerHTML = services.length
      ? services.map((service) => `
        <tr>
          <td><strong class="table-primary">${escapeHtml(service.nome)}</strong></td>
          <td class="service-description">${escapeHtml(service.descricao || 'Sem descrição')}</td>
          <td class="service-price">${escapeHtml(formatCurrency(service.preco))}</td>
          <td>${escapeHtml(String(service.duracaoMin))} min</td>
          <td><span class="status-badge status-${service.ativo ? 'ativo' : 'inativo'}">${service.ativo ? 'Ativo' : 'Inativo'}</span></td>
          <td class="table-actions">
            <button class="table-action" type="button" data-service-action="view" data-service-id="${service.id}">Consultar</button>
            <button class="table-action" type="button" data-service-action="edit" data-service-id="${service.id}">Editar</button>
            <button class="table-action" type="button" data-service-action="toggle" data-service-id="${service.id}" data-active="${service.ativo}">${service.ativo ? 'Desativar' : 'Ativar'}</button>
          </td>
        </tr>
      `).join('')
      : '<tr><td colspan="6"><div class="table-state"><strong>Nenhum serviço cadastrado</strong><span>Cadastre um serviço para preencher o catálogo.</span></div></td></tr>';
  } catch (requestError) {
    if (selectedCompany?.id !== companyId || !body.isConnected) return;
    body.innerHTML = '<tr><td colspan="6"><div class="table-state">A lista não está disponível.</div></td></tr>';
    error.innerHTML = `<span>Não foi possível carregar os serviços: ${escapeHtml(requestError.message)}</span><button class="secondary-button" type="button" id="retry-services">Tentar novamente</button>`;
    error.hidden = false;
    document.querySelector('#retry-services').addEventListener('click', loadServices);
  }
}

async function openServiceForm(service = null) {
  const dialog = document.querySelector('#service-dialog');
  const title = document.querySelector('#service-dialog-title');
  const content = document.querySelector('#service-dialog-content');
  let current = service;

  if (service?.id) {
    title.textContent = 'Editar serviço';
    content.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando dados...</span></div>';
    if (!dialog.open) dialog.showModal();
    try {
      current = await apiFetch(`/servicos/${service.id}`);
    } catch (error) {
      content.innerHTML = `<p class="form-error">Não foi possível carregar o serviço: ${escapeHtml(error.message)}</p>`;
      return;
    }
  } else {
    title.textContent = 'Novo serviço';
    current = null;
  }

  content.innerHTML = `
    <form class="entity-form" id="service-form" novalidate>
      <label>Nome do serviço
        <input name="nome" required maxlength="191" value="${escapeHtml(current?.nome || '')}" />
        <small class="field-error" data-error="nome"></small>
      </label>
      <label>Descrição
        <textarea name="descricao" maxlength="191">${escapeHtml(current?.descricao || '')}</textarea>
        <small class="field-error" data-error="descricao"></small>
      </label>
      <div class="form-grid">
        <label>Preço (R$)
          <input name="preco" type="number" min="0.01" step="0.01" required inputmode="decimal" value="${current ? escapeHtml(String(current.preco)) : ''}" />
          <small class="field-error" data-error="preco"></small>
        </label>
        <label>Duração (minutos)
          <input name="duracaoMin" type="number" min="5" step="1" required inputmode="numeric" value="${current ? escapeHtml(String(current.duracaoMin)) : ''}" />
          <small class="field-error" data-error="duracaoMin"></small>
        </label>
      </div>
      <small class="field-hint">O novo preço não altera os valores registrados em agendamentos anteriores.</small>
      <div class="dialog-actions">
        <button class="secondary-button" type="button" data-close-form>Cancelar</button>
        <button class="action-button" type="submit">${current ? 'Salvar alterações' : 'Cadastrar serviço'}</button>
      </div>
    </form>
  `;
  if (!dialog.open) dialog.showModal();

  content.querySelector('[data-close-form]').addEventListener('click', () => dialog.close());
  content.querySelector('#service-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const rawPrice = String(formData.get('preco') || '').trim().replace(',', '.');
    const price = Number(rawPrice);
    const duration = Number(formData.get('duracaoMin'));
    const payload = {
      nome: String(formData.get('nome') || '').trim(),
      descricao: String(formData.get('descricao') || '').trim(),
      preco: price,
      duracaoMin: duration,
    };
    const errors = {
      nome: !payload.nome ? 'Informe o nome do serviço.' : '',
      descricao: payload.descricao.length > 191 ? 'A descrição deve ter no máximo 191 caracteres.' : '',
      preco: !/^\d+(?:\.\d{1,2})?$/.test(rawPrice) || !Number.isFinite(price) || price <= 0
        ? 'Informe um preço maior que zero, com até duas casas decimais.'
        : '',
      duracaoMin: !Number.isInteger(duration) || duration < 5
        ? 'A duração deve ser um número inteiro de pelo menos 5 minutos.'
        : '',
    };
    Object.entries(errors).forEach(([field, message]) => {
      form.querySelector(`[data-error="${field}"]`).textContent = message;
    });
    if (Object.values(errors).some(Boolean)) return;

    const confirmed = await confirmAction(
      current ? 'Confirmar alteração' : 'Confirmar cadastro',
      current
        ? `Salvar as alterações do serviço ${payload.nome}? Agendamentos antigos mantêm seus valores registrados.`
        : `Cadastrar o serviço ${payload.nome} nesta empresa?`,
    );
    if (!confirmed) return;

    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    try {
      await apiFetch(current ? `/servicos/${current.id}` : '/servicos', {
        method: current ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      dialog.close();
      showToast(current ? 'Serviço atualizado com sucesso.' : 'Serviço cadastrado com sucesso.');
      await loadServices();
    } catch (error) {
      showToast(`Não foi possível salvar o serviço: ${error.message}`, 'error');
    } finally {
      if (submit.isConnected) submit.disabled = false;
    }
  });
}

async function toggleService(serviceId, active) {
  const confirmed = await confirmAction(
    active ? 'Desativar serviço' : 'Ativar serviço',
    `Confirma ${active ? 'desativar' : 'ativar'} este serviço? Os agendamentos anteriores serão preservados.`,
  );
  if (!confirmed) return;

  try {
    await apiFetch(`/servicos/${serviceId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ativo: !active }),
    });
    showToast(`Serviço ${active ? 'desativado' : 'ativado'} com sucesso.`);
    await loadServices();
  } catch (error) {
    showToast(`Não foi possível atualizar a situação: ${error.message}`, 'error');
  }
}

async function showServiceDetails(serviceId) {
  const dialog = document.querySelector('#service-dialog');
  const title = document.querySelector('#service-dialog-title');
  const content = document.querySelector('#service-dialog-content');
  content.innerHTML = '<div class="table-state"><span class="spinner" aria-label="Carregando"></span><span>Carregando informações...</span></div>';
  dialog.showModal();

  try {
    const service = await apiFetch(`/servicos/${serviceId}`);
    title.textContent = service.nome;
    content.innerHTML = `
      <div class="entity-details">
        <dl>
          <div><dt>Nome</dt><dd>${escapeHtml(service.nome)}</dd></div>
          <div><dt>Descrição</dt><dd>${escapeHtml(service.descricao || 'Sem descrição')}</dd></div>
          <div><dt>Preço atual</dt><dd>${escapeHtml(formatCurrency(service.preco))}</dd></div>
          <div><dt>Duração</dt><dd>${escapeHtml(String(service.duracaoMin))} minutos</dd></div>
          <div><dt>Situação</dt><dd>${service.ativo ? 'Ativo' : 'Inativo'}</dd></div>
        </dl>
        <p class="field-hint">O preço atual do catálogo não modifica os valores guardados em agendamentos anteriores.</p>
        <div class="dialog-actions"><button class="action-button" type="button" id="edit-service-detail">Editar serviço</button></div>
      </div>
    `;
    content.querySelector('#edit-service-detail').addEventListener('click', () => openServiceForm(service));
  } catch (error) {
    content.innerHTML = `<p class="form-error">Não foi possível consultar o serviço: ${escapeHtml(error.message)}</p>`;
  }
}

async function companySelectionContent() {
  const container = document.querySelector('#content');
  container.innerHTML = `
    <div class="company-selection-page">
      <div class="selection-brand">
        <div class="brand-mark" aria-hidden="true">BC</div>
        <div>
          <strong>BarberCut</strong>
          <span>Painel administrativo</span>
        </div>
      </div>
      <div class="selection-heading">
        <h2>Selecione uma empresa</h2>
        <p>Escolha a barbearia que será utilizada nesta sessão.</p>
      </div>
      <div class="company-grid" id="company-grid">
        <div class="selection-status">
          <div>
            <div class="spinner" aria-label="Carregando"></div>
            <p>Carregando empresas...</p>
          </div>
        </div>
      </div>
    </div>
  `;

  const grid = document.querySelector('#company-grid');

  try {
    const companies = await apiFetch('/empresas');
    const availableCompanies = Array.isArray(companies)
      ? companies.filter((company) => company.ativa !== false)
      : [];

    if (selectedCompany && !availableCompanies.some((company) => company.id === selectedCompany.id)) {
      updateSelectedCompany(null);
    }

    if (availableCompanies.length === 0) {
      grid.innerHTML = `
        <div class="selection-status">
          <div>
            <strong>Nenhuma empresa disponível</strong>
            <p>Não há empresas ativas cadastradas.</p>
          </div>
        </div>
      `;
      return;
    }

    grid.innerHTML = availableCompanies.map((company) => {
      const isSelected = selectedCompany?.id === company.id;
      return `
        <button class="company-card ${isSelected ? 'selected' : ''}" type="button" data-company-id="${company.id}">
          <span class="company-card-avatar" aria-hidden="true">${getInitials(company.nome)}</span>
          <span class="company-card-info">
            <strong>${escapeHtml(company.nome)}</strong>
            <span>${escapeHtml(company.cnpj || 'CNPJ não informado')}</span>
            ${company.telefone ? `<span>${escapeHtml(company.telefone)}</span>` : ''}
          </span>
          ${isSelected ? '<span class="selected-badge">Selecionada</span>' : ''}
        </button>
      `;
    }).join('');

    grid.querySelectorAll('.company-card').forEach((card) => {
      card.addEventListener('click', () => {
        const company = availableCompanies.find(
          (item) => item.id === Number(card.dataset.companyId),
        );
        if (!company) return;

        updateSelectedCompany(company);
        window.location.hash = '/dashboard';
      });
    });
  } catch (error) {
    grid.innerHTML = `
      <div class="selection-status error">
        <div>
          <strong>Não foi possível carregar as empresas</strong>
          <p>${escapeHtml(error.message)}</p>
          <button class="action-button" type="button" id="retry-companies">Tentar novamente</button>
        </div>
      </div>
    `;
    document.querySelector('#retry-companies').addEventListener('click', companySelectionContent);
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function closeMenu() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}

async function renderRoute() {
  const route = window.location.hash.replace(/^#\/?/, '') || 'dashboard';

  if (!selectedCompany && route !== 'empresas') {
    window.location.hash = '/empresas';
    return;
  }

  if (route === 'empresas') {
    document.title = `Selecionar empresa | BarberCut`;
    document.body.classList.add('company-selection-mode');
    closeMenu();
    companySelectionContent();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }

  try {
    const company = await apiFetch(`/empresas/${selectedCompany.id}`);
    if (company.ativa === false) {
      updateSelectedCompany(null);
      window.location.hash = '/empresas';
      return;
    }
    updateSelectedCompany(company);
  } catch (error) {
    updateSelectedCompany(null);
    window.location.hash = '/empresas';
    return;
  }

  updateNotificationBell();
  document.body.classList.remove('company-selection-mode');
  const page = pages.find((item) => item.id === route) || pages[0];

  document.title = `${page.title} | BarberCut`;
  content.innerHTML = pageContent(page);
  document.querySelectorAll('.nav-link').forEach((link) => {
    link.classList.toggle('active', link.dataset.page === page.id);
  });
  if (page.id === 'dashboard') {
    document.querySelector('#refresh-dashboard').addEventListener('click', loadDashboard);
    const appointmentDialog = document.querySelector('#appointment-dialog');
    document.querySelector('.dialog-close').addEventListener('click', () => appointmentDialog.close());
    appointmentDialog.addEventListener('click', (event) => {
      if (event.target === appointmentDialog) appointmentDialog.close();
    });
    loadDashboard();
  }
  if (page.id === 'clientes') initClientsPage();
  if (page.id === 'profissionais') initProfessionalsPage();
  if (page.id === 'servicos') initServicesPage();
  if (page.id === 'agendamentos') initAppointmentsPage();
  if (page.id === 'pagamentos') initPaymentsPage();
  if (page.id === 'notificacoes') initNotificationsPage();
  if (page.id === 'relatorios') initReportsPage();
  closeMenu();
  content.focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

menuToggle.addEventListener('click', () => {
  const isOpen = sidebar.classList.toggle('open');
  backdrop.classList.toggle('open', isOpen);
  menuToggle.setAttribute('aria-expanded', String(isOpen));
});

backdrop.addEventListener('click', closeMenu);
document.querySelector('#company-switcher').addEventListener('click', () => {
  window.location.hash = '/empresas';
});
document.querySelector('#notification-button').addEventListener('click', () => {
  window.location.hash = '/notificacoes';
});

window.addEventListener('hashchange', renderRoute);
renderRoute();
