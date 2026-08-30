// @ts-check
/* Checagem estática do .gitignore da raiz — garante que o lockfile dos
   testes é versionado e que só os artefatos GERADOS por rodar os testes
   ficam de fora do Source Control. */
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const gitignore = fs.readFileSync(path.join(__dirname, '..', '.gitignore'), 'utf8');

test.describe('.gitignore — higiene do repositório para os testes locais', () => {
  // AH ──────────────────────────────────────────────────────────
  test('AH: package-lock.json NÃO está no .gitignore (fica versionado)', () => {
    expect(gitignore).not.toMatch(/^\/?package-lock\.json$/im);
  });

  // AI ──────────────────────────────────────────────────────────
  test('AI: node_modules, test-results e playwright-report continuam ignorados', () => {
    expect(gitignore).toMatch(/node_modules\/?/);
    expect(gitignore).toMatch(/test-results\/?/);
    expect(gitignore).toMatch(/playwright-report\/?/);
  });

  test('package-lock.json existe de verdade no disco', () => {
    expect(fs.existsSync(path.join(__dirname, '..', 'package-lock.json'))).toBe(true);
  });
});
