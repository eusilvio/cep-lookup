import { defineConfig } from "vitepress";

const REPO = "https://github.com/eusilvio/cep-lookup";

export default defineConfig({
  title: "cep-lookup",
  base: "/cep-lookup/",
  cleanUrls: true,
  lastUpdated: true,
  ignoreDeadLinks: false,

  head: [
    ["link", { rel: "icon", type: "image/svg+xml", href: "/cep-lookup/favicon.svg" }],
    ["meta", { name: "theme-color", content: "#10b981" }],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "cep-lookup" }],
  ],

  themeConfig: {
    logo: "/logo.svg",
    search: {
      provider: "local",
      options: {
        locales: {
          root: {
            translations: {
              button: { buttonText: "Buscar", buttonAriaLabel: "Buscar" },
              modal: {
                displayDetails: "Exibir detalhes",
                resetButtonTitle: "Limpar busca",
                backButtonTitle: "Voltar",
                noResultsText: "Nenhum resultado para",
                footer: {
                  selectText: "selecionar",
                  navigateText: "navegar",
                  closeText: "fechar",
                },
              },
            },
          },
        },
      },
    },
    socialLinks: [
      { icon: "github", link: REPO },
      { icon: "npm", link: "https://www.npmjs.com/package/@eusilvio/cep-lookup" },
    ],
  },

  locales: {
    root: {
      label: "Português (BR)",
      lang: "pt-BR",
      description:
        "Motor de resolução de CEP tolerante a falhas: corrida entre provedores, circuit breaker, cache persistente e fallback offline.",
      themeConfig: {
        nav: [
          { text: "Guia", link: "/guide/introduction", activeMatch: "/guide/" },
          { text: "API", link: "/api/cep-lookup", activeMatch: "/api/" },
          { text: "Exemplos", link: "/guide/cookbook" },
          {
            text: "Pacotes",
            items: [
              { text: "@eusilvio/cep-lookup", link: "https://www.npmjs.com/package/@eusilvio/cep-lookup" },
              { text: "@eusilvio/cep-lookup-react", link: "https://www.npmjs.com/package/@eusilvio/cep-lookup-react" },
              { text: "@eusilvio/cep-lookup-vue", link: "https://www.npmjs.com/package/@eusilvio/cep-lookup-vue" },
              { text: "@eusilvio/zip-lookup", link: "https://www.npmjs.com/package/@eusilvio/zip-lookup" },
            ],
          },
        ],
        sidebar: {
          "/": [
            {
              text: "Começando",
              items: [
                { text: "Introdução", link: "/guide/introduction" },
                { text: "Início rápido", link: "/guide/quick-start" },
                { text: "Como funciona", link: "/guide/how-it-works" },
              ],
            },
            {
              text: "Recursos",
              items: [
                { text: "Provedores", link: "/guide/providers" },
                { text: "Resiliência", link: "/guide/resilience" },
                { text: "Cache", link: "/guide/cache" },
                { text: "Camada offline", link: "/guide/offline" },
                { text: "Observabilidade", link: "/guide/observability" },
                { text: "Tratamento de erros", link: "/guide/errors" },
              ],
            },
            {
              text: "Integrações",
              items: [
                { text: "React", link: "/guide/react" },
                { text: "Vue", link: "/guide/vue" },
                { text: "ZIP (EUA)", link: "/guide/zip-lookup" },
              ],
            },
            {
              text: "Na prática",
              items: [
                { text: "Boas práticas", link: "/guide/best-practices" },
                { text: "Exemplos", link: "/guide/cookbook" },
                { text: "Migração", link: "/guide/migration" },
              ],
            },
            {
              text: "Referência da API",
              items: [
                { text: "CepLookup", link: "/api/cep-lookup" },
                { text: "Tipos", link: "/api/types" },
                { text: "Cache", link: "/api/cache" },
                { text: "Offline", link: "/api/offline" },
                { text: "Erros", link: "/api/errors" },
              ],
            },
          ],
        },
        editLink: {
          pattern: `${REPO}/edit/main/docs/:path`,
          text: "Sugerir alteração nesta página",
        },
        docFooter: { prev: "Anterior", next: "Próxima" },
        outline: { label: "Nesta página" },
        lastUpdated: { text: "Atualizado em" },
        darkModeSwitchLabel: "Aparência",
        lightModeSwitchTitle: "Mudar para tema claro",
        darkModeSwitchTitle: "Mudar para tema escuro",
        sidebarMenuLabel: "Menu",
        returnToTopLabel: "Voltar ao topo",
        langMenuLabel: "Idioma",
        notFound: {
          title: "Página não encontrada",
          quote: "Este endereço não existe em nenhuma faixa dos Correios.",
          linkText: "Voltar para o início",
        },
        footer: {
          message: "Publicado sob a licença MIT.",
          copyright: "© 2025-presente Silvio Souza",
        },
      },
    },

    en: {
      label: "English (US)",
      lang: "en-US",
      link: "/en/",
      description:
        "Fault-tolerant CEP resolution engine: provider racing, circuit breaker, persistent cache and offline fallback.",
      themeConfig: {
        nav: [
          { text: "Guide", link: "/en/guide/introduction", activeMatch: "/en/guide/" },
          { text: "API", link: "/en/api/cep-lookup", activeMatch: "/en/api/" },
          { text: "Cookbook", link: "/en/guide/cookbook" },
          {
            text: "Packages",
            items: [
              { text: "@eusilvio/cep-lookup", link: "https://www.npmjs.com/package/@eusilvio/cep-lookup" },
              { text: "@eusilvio/cep-lookup-react", link: "https://www.npmjs.com/package/@eusilvio/cep-lookup-react" },
              { text: "@eusilvio/cep-lookup-vue", link: "https://www.npmjs.com/package/@eusilvio/cep-lookup-vue" },
              { text: "@eusilvio/zip-lookup", link: "https://www.npmjs.com/package/@eusilvio/zip-lookup" },
            ],
          },
        ],
        sidebar: {
          "/en/": [
            {
              text: "Getting started",
              items: [
                { text: "Introduction", link: "/en/guide/introduction" },
                { text: "Quick start", link: "/en/guide/quick-start" },
                { text: "How it works", link: "/en/guide/how-it-works" },
              ],
            },
            {
              text: "Features",
              items: [
                { text: "Providers", link: "/en/guide/providers" },
                { text: "Resilience", link: "/en/guide/resilience" },
                { text: "Cache", link: "/en/guide/cache" },
                { text: "Offline layer", link: "/en/guide/offline" },
                { text: "Observability", link: "/en/guide/observability" },
                { text: "Error handling", link: "/en/guide/errors" },
              ],
            },
            {
              text: "Integrations",
              items: [
                { text: "React", link: "/en/guide/react" },
                { text: "Vue", link: "/en/guide/vue" },
                { text: "US ZIP", link: "/en/guide/zip-lookup" },
              ],
            },
            {
              text: "In practice",
              items: [
                { text: "Best practices", link: "/en/guide/best-practices" },
                { text: "Cookbook", link: "/en/guide/cookbook" },
                { text: "Migration", link: "/en/guide/migration" },
              ],
            },
            {
              text: "API reference",
              items: [
                { text: "CepLookup", link: "/en/api/cep-lookup" },
                { text: "Types", link: "/en/api/types" },
                { text: "Cache", link: "/en/api/cache" },
                { text: "Offline", link: "/en/api/offline" },
                { text: "Errors", link: "/en/api/errors" },
              ],
            },
          ],
        },
        editLink: {
          pattern: `${REPO}/edit/main/docs/:path`,
          text: "Edit this page on GitHub",
        },
        footer: {
          message: "Released under the MIT License.",
          copyright: "© 2025-present Silvio Souza",
        },
      },
    },
  },
});
