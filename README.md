# Seed Map Java 1.8 com Cubiomes WebAssembly

Esta versão não usa o gerador aproximado anterior. O GitHub Actions baixa a
biblioteca open-source Cubiomes, compila para WebAssembly e publica um site
estático no GitHub Pages.

## Instalação

1. Extraia todos os arquivos deste ZIP.
2. Envie tudo para a raiz de um repositório GitHub, incluindo a pasta `.github`.
3. Abra **Settings → Pages**.
4. Em **Source**, selecione **GitHub Actions**.
5. Abra a aba **Actions** e acompanhe `Build e publicar Seed Map`.
6. Quando ficar verde, abra o endereço mostrado em **Settings → Pages**.

Não selecione `Deploy from a branch`: esta versão precisa do workflow para gerar
`cubiomes.js` e `cubiomes.wasm`.

## Seed padrão

Abra `public/script.js` e altere:

```js
// COLOQUE_SUA_SEED_AQUI
const DEFAULT_SEED = 1924581720546285046n;
```

Mantenha o `n` no final.

## Arquivos gerados

O workflow produz automaticamente:

- `cubiomes.js`
- `cubiomes.wasm`

Esses arquivos são publicados junto com o HTML, CSS, JavaScript e os ícones.

## Precisão

- Biomas: gerados pelo Cubiomes para Java 1.8.
- Vilas, templos, cabanas e monumentos: posição candidata e verificação de
  bioma pelo Cubiomes.
- Strongholds: busca de bioma pelo iterador do Cubiomes.
- O site não gera blocos individuais do terreno.


## Spawn do mundo

A cruz vermelha continua marcando a origem `0,0`.

A estrela branca e vermelha marca o spawn calculado pelo Cubiomes. Em versões
anteriores à 1.18, o ponto final dentro do jogo ainda pode variar alguns blocos,
porque depende do bloco de superfície encontrado pelo Minecraft.


## Ícones e minas abandonadas

- Os ícones visuais são baixados do Tabler Icons durante o GitHub Actions.
- A origem `0,0` não recebe mais um marcador.
- O spawn continua sendo mostrado separadamente.
- Minas abandonadas podem ser ativadas no painel. Elas aparecem apenas em
  zoom suficiente para evitar milhares de cálculos e marcadores.
- Consulte `ICONS.md` para a licença dos ícones.
