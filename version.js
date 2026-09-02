// Fonte única da versão do app — lida por index.html (rodapé) e por
// service-worker.js (importScripts, pra nomear o cache). Versionamento
// semântico: MAJOR.MINOR.PATCH. Ver CHANGELOG.md pra histórico completo.
//
// `self` (não `window`/`const` solto) porque isso precisa funcionar tanto
// na página quanto dentro do service worker — e um `const` no topo de um
// script clássico não vira propriedade de `window`, só fica no escopo
// léxico do script.
self.APP_VERSION = "1.11.1";
