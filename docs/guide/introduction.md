# Introdução

`cep-lookup` é um **motor de resolução de CEP tolerante a falhas**, não apenas mais um wrapper de API.

A maioria das bibliotecas de CEP resolve o cenário ideal: chama o ViaCEP, devolve o endereço e pronto. O problema aparece em produção, quando o ViaCEP fica lento às 18h, o APICep responde 500 por dez minutos ou a rede do seu container simplesmente some. Nesse momento a sua tela de checkout trava.

Esta biblioteca ataca exatamente esse cenário: ela corre vários provedores em paralelo, isola os instáveis com circuit breaker, guarda o que já resolveu num cache que sobrevive ao processo e, no último degrau, ainda responde sem rede nenhuma.

## Os pacotes

| Pacote | O que é |
| --- | --- |
| [`@eusilvio/cep-lookup`](https://www.npmjs.com/package/@eusilvio/cep-lookup) | Motor principal, agnóstico de framework |
| [`@eusilvio/cep-lookup-react`](https://www.npmjs.com/package/@eusilvio/cep-lookup-react) | Hooks e context provider para React |
| [`@eusilvio/cep-lookup-vue`](https://www.npmjs.com/package/@eusilvio/cep-lookup-vue) | Composables para Vue 3 |
| [`@eusilvio/zip-lookup`](https://www.npmjs.com/package/@eusilvio/zip-lookup) | Códigos postais dos EUA, mesma arquitetura |

Todos são publicados na mesma versão, com ESM e CJS, tipos incluídos e `sideEffects: false`.

## A escada de fallback

Uma chamada a `lookup()` percorre, nesta ordem, até alguém responder:

```
cache (hit) → coalescência → corrida entre provedores → retries
   → cache stale (stale-if-error) → fallback offline → erro
```

Cada degrau é opcional e ligado por configuração. Sem nada configurado, você tem uma corrida entre provedores e mais nada - que já é melhor que um cliente de provedor único.

## Quando usar

- **Checkout e cadastro**: o formulário não pode travar porque um provedor caiu.
- **Backends de alto volume**: cache compartilhado no Redis evita repetir o mesmo CEP em todo processo.
- **Edge/Workers**: cache em KV e bundle pequeno, sem dependências.
- **Jobs em lote**: `lookupCeps()` com concorrência controlada e rate limit.
- **Qualidade de cadastro**: `verifyAddress()` confere o endereço digitado contra o CEP - número incluído - e encontra o CEP certo quando o digitado está errado.

## Quando não usar

Se você resolve um CEP por semana num script interno, `fetch` direto no ViaCEP resolve. O valor aqui está em uptime sob carga, não em ergonomia de chamada.

## Compatibilidade

- Node.js `20.x`, `22.x`, `24.x`
- React `>= 16.8`
- Vue `^3`
- Browser: requer `fetch`, `Promise.any` e `AbortController`

## Próximo passo

[Início rápido](/guide/quick-start) - instalar, resolver o primeiro CEP e ligar a configuração recomendada de produção.
