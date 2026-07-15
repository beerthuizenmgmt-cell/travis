// Legacy login page — redirect naar CRM-login.
const target = '/crm/' + window.location.search + window.location.hash;
window.location.replace(target);
