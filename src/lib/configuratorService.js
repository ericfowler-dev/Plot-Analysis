const API_BASE = '/api/configurator';

async function apiCall(endpoint) {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    headers: { 'Content-Type': 'application/json' }
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }
  return data;
}

export async function getConfiguratorState() {
  const result = await apiCall('/');
  return result.configurator;
}
