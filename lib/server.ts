import {env} from 'cloudflare:workers';
export function db(){if(!env.DB)throw new Error('Banco indisponível');return env.DB;}
export function bucket(){if(!env.BUCKET)throw new Error('Arquivos indisponíveis');return env.BUCKET;}
export function failure(e:unknown){console.error(e);const unauth=e instanceof Error&&e.name==='Unauthenticated';return Response.json({error:unauth?'Sessão encerrada. Entre novamente.':e instanceof Error?e.message:'Não foi possível salvar. Tente novamente.'},{status:unauth?401:400});}
export function sameOrigin(r:Request){const o=r.headers.get('origin');if(o&&o!==new URL(r.url).origin)throw new Error('Origem inválida');}
