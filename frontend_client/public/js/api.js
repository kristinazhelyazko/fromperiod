const API_BASE_URL =
  (window.__API_BASE_URL__ && window.__API_BASE_URL__.trim())
    ? window.__API_BASE_URL__.replace(/\/$/, '')
    : 'http://localhost:3004/api';

async function apiRequest(endpoint, options = {}) {
  try {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {}),
      },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error('API request error:', error);
    throw error;
  }
}
