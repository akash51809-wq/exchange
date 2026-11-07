'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { addPanelChrome } = require('../lib/panel-chrome');

test('User Panel Logout: href and client redirect point directly to Website Homepage (/)', async () => {
  const baseHtml = `<!DOCTYPE html><html><head><title>Dashboard</title></head><body><div class="page">Content</div></body></html>`;
  const framedHtml = await addPanelChrome(baseHtml, {
    role: 'user',
    userId: '00000000-0000-0000-0000-000000000001',
    currentPath: '/dashboard',
  });

  // Verify href on logout button is '/' for user role
  assert.match(
    framedHtml,
    /<a\s+href="\/"\s+id="logout-button"/i,
    'User panel logout link must point directly to homepage (/)'
  );

  // Verify click handler fallback redirects to '/' for user
  assert.match(
    framedHtml,
    /window\.location\.href\s*=\s*'\/'/i,
    'User panel click handler fallback must redirect to homepage (/)'
  );

  // Verify it does NOT hardcode /admin/login for users
  assert.equal(
    framedHtml.includes('href="/admin/login" id="logout-button"'),
    false,
    'User panel must NOT link logout button to /admin/login'
  );
});

test('Admin Panel Logout: href and client redirect point to /admin/login', async () => {
  const baseHtml = `<!DOCTYPE html><html><head><title>Admin</title></head><body><div class="page">Admin Content</div></body></html>`;
  const framedHtml = await addPanelChrome(baseHtml, {
    role: 'admin',
    userId: '00000000-0000-0000-0000-000000000002',
    currentPath: '/admin/users/list',
  });

  // Verify href on logout button is '/admin/login' for admin role
  assert.match(
    framedHtml,
    /<a\s+href="\/admin\/login"\s+id="logout-button"/i,
    'Admin panel logout link must point to /admin/login'
  );

  // Verify click handler fallback redirects to '/admin/login' for admin
  assert.match(
    framedHtml,
    /window\.location\.href\s*=\s*'\/admin\/login'/i,
    'Admin panel click handler fallback must redirect to /admin/login'
  );
});
