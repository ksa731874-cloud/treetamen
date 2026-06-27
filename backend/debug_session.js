const http = require('http');

function req(path, method = 'GET', body = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: 3000,
      path,
      method,
      headers
    };

    const r = http.request(opts, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        resolve({ status: res.statusCode, headers: res.headers, body: data });
      });
    });

    r.on('error', reject);
    if (body) r.write(body);
    r.end();
  });
}

(async () => {
  try {
    let cookie = '';
    const root = await req('/');
    console.log('ROOT', root.status);
    console.log('root-set-cookie', root.headers['set-cookie']);
    if (root.headers['set-cookie']) cookie = root.headers['set-cookie'][0].split(';')[0];

    const status1 = await req('/api/session-status', 'GET', null, { Cookie: cookie });
    console.log('STATUS1', status1.status, status1.body);

    const step1 = await req('/api/complete-step', 'POST', JSON.stringify({ step: 'STEP1' }), {
      'Content-Type': 'application/json',
      Cookie: cookie
    });
    console.log('STEP1', step1.status, step1.body, step1.headers['set-cookie']);
    if (step1.headers['set-cookie']) cookie = step1.headers['set-cookie'][0].split(';')[0];

    const form1 = await req('/form1', 'GET', null, { Cookie: cookie });
    console.log('FORM1', form1.status, form1.headers['set-cookie'], form1.body.slice(0,120));

    const step2 = await req('/api/complete-step', 'POST', JSON.stringify({ step: 'STEP2' }), {
      'Content-Type': 'application/json',
      Cookie: cookie
    });
    console.log('STEP2', step2.status, step2.body, step2.headers['set-cookie']);

    const select = await req('/select', 'GET', null, { Cookie: cookie });
    console.log('SELECT', select.status, JSON.stringify(select.headers).slice(0,200), select.body.slice(0,120));

    const status2 = await req('/api/session-status', 'GET', null, { Cookie: cookie });
    console.log('STATUS2', status2.status, status2.body);
  } catch (e) {
    console.error('ERROR', e);
  }
})();