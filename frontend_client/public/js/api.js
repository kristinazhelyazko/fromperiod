const API_BASE_URL =
  (window.__API_BASE_URL__ && window.__API_BASE_URL__.trim())
    ? window.__API_BASE_URL__.replace(/\/$/, '')
    : (window.location.origin.replace(/\/$/, '') + '/api');

async function apiRequest(endpoint, options = {}) {
  try {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${API_BASE_URL}${endpoint}`;
    const response = await fetch(url, {
      ...options,
      cache: 'no-store',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
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
