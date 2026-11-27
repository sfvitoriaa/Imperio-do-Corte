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
      apiFetch('/notificacoes'),
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

  const actionLabels = {
    clientes: 'Novo cliente',
    profissionais: 'Novo profissional',
    servicos: 'Novo serviço',
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
