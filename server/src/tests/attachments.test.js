'use strict';
// W3.1 — attachments file_url / metadata validation (2026-06-10)
const { test } = require('node:test');
const assert = require('node:assert');
const { validateFileUrl, validateAttachmentMeta } = require('../routes/attachments');

test('validateFileUrl accepts http(s) and app-relative paths', () => {
  assert.ok(validateFileUrl('https://example.com/doc.pdf'));
  assert.ok(validateFileUrl('http://example.com/a?b=c&d=e'));
  assert.ok(validateFileUrl('/api/correspondence/files/correspondence/general/1/x.pdf'));
  assert.ok(validateFileUrl('/uploads/incident-media/123-scene.jpg'));
});

test('validateFileUrl rejects dangerous schemes and shapes', () => {
  assert.equal(validateFileUrl('javascript:alert(1)'), false);
  assert.equal(validateFileUrl('data:text/html,<script>1</script>'), false);
  assert.equal(validateFileUrl('vbscript:msgbox(1)'), false);
  assert.equal(validateFileUrl('file:///etc/passwd'), false);
  assert.equal(validateFileUrl('//evil.com/x'), false);          // protocol-relative
  assert.equal(validateFileUrl('/files/../../../etc/passwd'), false); // traversal
  assert.equal(validateFileUrl('relative/no/leading/slash'), false);
  assert.equal(validateFileUrl(''), false);
  assert.equal(validateFileUrl(null), false);
  assert.equal(validateFileUrl(123), false);
  assert.equal(validateFileUrl('x'.repeat(3000)), false);
  assert.equal(validateFileUrl('/ok\u0000null'), false); // control char
});

test('validateAttachmentMeta enforces file_name / type / size shape', () => {
  const ok = { file_name: 'report.pdf', file_url: '/uploads/incident-media/report.pdf' };
  assert.equal(validateAttachmentMeta(ok), null);
  assert.match(validateAttachmentMeta({ ...ok, file_name: '../../etc/passwd' }), /file_name/);
  assert.match(validateAttachmentMeta({ ...ok, file_name: 'a\\b.pdf' }), /file_name/);
  assert.match(validateAttachmentMeta({ ...ok, file_name: 'x'.repeat(300) }), /file_name/);
  assert.match(validateAttachmentMeta({ ...ok, file_url: 'javascript:1' }), /file_url/);
  assert.match(validateAttachmentMeta({ ...ok, file_type: 'y'.repeat(200) }), /file_type/);
  assert.match(validateAttachmentMeta({ ...ok, file_size: -5 }), /file_size/);
  assert.match(validateAttachmentMeta({ ...ok, file_size: 'NaN-ish' }), /file_size/);
  assert.equal(validateAttachmentMeta({ ...ok, file_size: 1024, file_type: 'application/pdf' }), null);
});
