# Testar King Foods na sua conta Cloudflare

Este roteiro publica uma instalação de teste isolada usando Cloudflare Workers, D1 e R2. Ela começa com uma base vazia; o banco e anexos do Site original não são copiados.

## 1. Preparar o computador

Instale Node.js 22.13 ou superior. Abra o PowerShell na pasta extraída, onde está `package.json`, e instale pnpm 11.25.0:

```powershell
npm install -g pnpm@11.25.0
pnpm.cmd install --frozen-lockfile
pnpm.cmd run build
```

## 2. Entrar na Cloudflare e criar recursos de teste

```powershell
pnpm.cmd exec wrangler login
pnpm.cmd exec wrangler whoami
pnpm.cmd exec wrangler d1 create king-foods-teste
pnpm.cmd exec wrangler r2 bucket create king-foods-teste-arquivos
```

Guarde o `database_id` mostrado por `d1 create`. Abra `dist/server/wrangler.json` no Bloco de Notas. Altere:

- `name` para `king-foods-teste`;
- dentro de `d1_databases`, `database_name` para `king-foods-teste` e `database_id` para o ID criado;
- dentro de `r2_buckets`, `bucket_name` para `king-foods-teste-arquivos`.

Mantenha os nomes dos vínculos `DB` e `BUCKET`. Não publique o arquivo de configuração com o ID de outra conta ou banco.

## 3. Criar tabelas vazias no D1 remoto

No mesmo PowerShell, aplique cada migração SQL do pacote uma única vez:

```powershell
Get-ChildItem .\drizzle\*.sql | Sort-Object Name | ForEach-Object {
  pnpm.cmd exec wrangler d1 execute DB --remote --config .\dist\server\wrangler.json --file $_.FullName
}
```

`--remote` grava no D1 da sua conta; confira com cuidado que os nomes são `king-foods-teste` antes de confirmar. As migrações do Wrangler aceitam arquivos SQL para executar no banco local ou remoto. Consulte a documentação oficial se aparecer uma mensagem diferente.

## 4. Publicar o Worker

```powershell
pnpm.cmd exec wrangler deploy --config .\dist\server\wrangler.json
```

O Wrangler mostrará um endereço `https://...workers.dev`. Abra esse endereço para conferir o sistema. Se pedir, habilite o subdomínio `workers.dev` no painel da Cloudflare.

## 5. Configurar o cadastro inicial protegido

Gere um token aleatório no seu computador:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Copie o token e guarde-o temporariamente. Cadastre-o como segredo do Worker; o Wrangler solicitará o valor:

```powershell
pnpm.cmd exec wrangler secret put BOOTSTRAP_TOKEN --config .\dist\server\wrangler.json
```

Abra o endereço `workers.dev`, informe esse token na tela e crie o primeiro administrador. O token nunca deve ser colocado no código nem compartilhado. Depois de criar o administrador, o sistema fecha o cadastro inicial automaticamente. Você pode remover o segredo após confirmar o primeiro login:

```powershell
pnpm.cmd exec wrangler secret delete BOOTSTRAP_TOKEN --config .\dist\server\wrangler.json
```

## Observações

- Esta instalação usa banco e armazenamento próprios da sua conta Cloudflare, independentes dos dados do site em Sites.
- Para começar limpa, use recursos novos. O pacote não contém os dados, clientes, títulos, anexos ou usuários atuais.
- Ao alterar o código e compilar novamente, preserve/atualize o arquivo `dist/server/wrangler.json` com os mesmos vínculos antes do próximo deploy.
- Teste importação, login, anexos e cadastro antes de usar com dados reais. Faça cópia de segurança antes de qualquer migração de dados.
- O modo gratuito tem cotas e não garante disponibilidade contínua. Consulte preços e limites atuais da Cloudflare.
