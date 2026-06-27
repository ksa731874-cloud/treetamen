const fs = require('fs');

(async () => {
  try {
    const url = 'http://127.0.0.1:3000/api/send-message';
    const body = JSON.stringify({ text: 'hello from local test' });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    console.log('STATUS', res.status);
    console.log(await res.text());
  } catch (e) {
    console.error('ERROR', e);
  }
})();
