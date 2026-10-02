const fs = require('node:fs');

fs.writeFileSync('.audit-karma.cjs', `
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function(config) {
  await require('./karma.conf.cjs')(config);
  const capturePlugin = {
    'middleware:chartjsCapture': ['factory', function() {
      return function(req, res, next) {
        if (req.url !== '/chartjs-audit-capture') {
          return next();
        }
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
          const capture = JSON.parse(body);
          const name = process.env.AUDIT_NAME;
          fs.mkdirSync('audit-output', {recursive: true});
          fs.writeFileSync(path.join('audit-output', name + '.png'), Buffer.from(capture.png.split(',')[1], 'base64'));
          delete capture.png;
          fs.writeFileSync(path.join('audit-output', name + '.json'), JSON.stringify(capture, null, 2));
          res.end('captured');
        });
      };
    }]
  };
  config.set({
    files: [...config.files.filter(file => !(typeof file === 'string' ? file : file.pattern).includes('test/specs/')), {pattern: 'test/chartjs-12321.audit.tests.js'}],
    plugins: [...config.plugins, capturePlugin],
    beforeMiddleware: ['chartjsCapture']
  });
};
`);

fs.writeFileSync('test/chartjs-12321.audit.tests.js', `
describe('Chart.js 12321 pristine overlapping fixture', function() {
  it('captures the canvas and layout before asserting the unchanged fixture', async function() {
    const source = await fetch('/base/test/fixtures/controller.polarArea/pointLabels/overlapping.js').then(response => response.text());
    const fixture = new Function('var module = {};' + source + ';return module.exports;')();
    fixture.config.options.plugins = false;
    const chart = window.acquireChart(fixture.config, fixture.options);
    const r = chart.scales.r;
    const capture = {
      userAgent: navigator.userAgent,
      width: chart.width,
      height: chart.height,
      chartArea: chart.chartArea,
      scale: {xCenter: r.xCenter, yCenter: r.yCenter, drawingArea: r.drawingArea, items: r._pointLabelItems},
      png: chart.canvas.toDataURL('image/png')
    };
    await fetch('/chartjs-audit-capture', {method: 'POST', body: JSON.stringify(capture)});
    const expected = new Image();
    await new Promise(resolve => { expected.onload = resolve; expected.src = '/base/test/fixtures/controller.polarArea/pointLabels/overlapping.png'; });
    const canvas = document.createElement('canvas');
    canvas.width = expected.width;
    canvas.height = expected.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(expected, 0, 0);
    expect(chart).toEqualImageData(ctx.getImageData(0, 0, canvas.width, canvas.height), fixture);
  });
});
`);
