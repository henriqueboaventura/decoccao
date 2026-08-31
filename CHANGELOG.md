# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/),
versionamento segue [SemVer](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`).
A versão atual fica em `version.js` e aparece no rodapé do app.

## [1.1.0] — 2026-08-31

### Adicionado
- Tooltip "?" em cada parâmetro do formulário, com explicação mais longa e
  específica do que cada campo faz.
- Tooltip no pill "puxar" das etapas de decocção — varia entre recomendar
  puxada grossa ou rala conforme a etapa ainda precisa descansar pra
  sacarificação ou não (fonte: Braukaiser Wiki, Decoction Mashing).
- Descrição resumida de cada método, exibida no topo abaixo das abas.
- Aviso de nova versão disponível (PWA), com botão "Recarregar" que fica
  visível até o usuário agir.
- Link pro Brassagem Forte no rodapé.
- Versionamento do app (`version.js`, este changelog).

### Corrigido
- Volume de decocção devolvida em mais de uma adição estava superestimado
  em 16% (Dupla Aprimorada: 12,92L → 11,14L, agora bate com a Dupla
  Moderna pra mesma física de mistura).
- Inputs de parâmetro agora respeitam min/max de verdade (antes aceitavam
  qualquer valor digitado, incluindo negativos ou fora de faixa).
- No celular, o volume "puxar" ficava escrito em cima das temperaturas na
  lista de etapas — agora tem linha própria.
- Método Boaventura: rampas de maltose e dextrinização estavam com os
  tempos reais (não só os digitados) invertidos em relação à literatura do
  Hochkurz; ajustados os defaults (~35min reais a 62°C e ~44min a 71°C,
  total 1h34 em vez de 1h49).

### Interno
- Cache do service worker agora nomeado a partir da versão do app
  (`decoccao-v{versão}`), então todo bump de versão invalida o cache
  automaticamente — antes dependia de lembrar de trocar `CACHE_VERSION` à
  mão.

## [1.0.0] — 2026-08-29

A ferramenta deixa de ser só um planejador de cronograma e passa a
calcular o **volume de decocção** de cada puxada.

### Adicionado
- Motor de cálculo do volume a puxar em cada decocção (balanço de energia
  clássico), com campos de insumo (volume de água, massa de malte).
- Método **Boaventura** (autoral): rampas de maltose e dextrinização por
  aquecimento direto na tina, decocção única no fim do processo.
- Tooltip do gráfico de temperatura x tempo.

### Corrigido
- Diversos rótulos da interface com português incorreto.

## [0.1.1] — 2026-08-28

### Adicionado
- Créditos no rodapé (Henrique Boaventura e Fábio Koerich, Brassagem
  Forte).

## [0.1.0] — 2026-08-27

Versão inicial: PWA de calculadora de decocção reconstruída a partir da
planilha `Cálculos de decocção .xlsx`. Só cronograma — ainda sem cálculo
de volume.

### Adicionado
- 4 métodos iniciais: Simples, Dupla Tradicional, Dupla Moderna, Tripla
  Tradicional, com parâmetros editáveis e tabela de passo a passo.
- Gráfico de temperatura x tempo das duas tinas (mostura e fervura), com
  ponto e horário marcados em toda mudança de temperatura.
- Cronômetro de brassagem (iniciar/pausar/resetar/próxima etapa), com
  estado salvo por método (relógio de parede, sobrevive a reload).
- Métodos **Hochkurz** e **Dupla Aprimorada** (Enhanced Double Decoction),
  cruzados com o Braukaiser Wiki; ajuste da Simples pro "Single Decoction"
  do mesmo wiki.
- PWA instalável, funciona offline (Service Worker + manifest), ícones
  redesenhados.
- Autosave no `localStorage`, predefinições nomeadas (ocultas da UI por
  ora), exportar/importar configuração em JSON.

[1.1.0]: https://github.com/henriqueboaventura/decoccao/compare/a162452...5e60f93
[1.0.0]: https://github.com/henriqueboaventura/decoccao/compare/f9b0ed9...a162452
[0.1.1]: https://github.com/henriqueboaventura/decoccao/compare/12643a4...f9b0ed9
[0.1.0]: https://github.com/henriqueboaventura/decoccao/commits/12643a4
