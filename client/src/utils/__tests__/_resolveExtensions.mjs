/**
 * Node ESM resolve hook for tests ONLY.
 *
 * The client source is built by Vite, which resolves extensionless relative
 * imports (e.g. `import ... from '../data/nerisTypes'` inside nerisExport.js).
 * Plain Node ESM requires explicit extensions, so this hook retries any
 * failing relative specifier with `.js` appended. Registered from the test
 * file via module.register() — production code is never modified.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (
      err && err.code === 'ERR_MODULE_NOT_FOUND' &&
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      !/\.[a-zA-Z]+$/.test(specifier)
    ) {
      return nextResolve(`${specifier}.js`, context);
    }
    throw err;
  }
}
