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
        <p>Visão geral da barbearia</p>
      </div>
    </div>
    <div class="card-grid">
      <article class="card">
        <h3>Agendamentos de hoje</h3>
        <p class="card-value">—</p>
      </article>
      <article class="card">
        <h3>Clientes cadastrados</h3>
        <p class="card-value">—</p>
      </article>
      <article class="card">
        <h3>Profissionais ativos</h3>
        <p class="card-value">—</p>
      </article>
    </div>
  `;
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
