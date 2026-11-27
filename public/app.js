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

function closeMenu() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('open');
  menuToggle.setAttribute('aria-expanded', 'false');
}

function renderRoute() {
  const route = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
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
document.querySelector('#notification-button').addEventListener('click', () => {
  window.location.hash = '/notificacoes';
});

window.addEventListener('hashchange', renderRoute);
renderRoute();
