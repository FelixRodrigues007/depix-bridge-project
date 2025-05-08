# DePix Bridge API

Este servidor fornece uma API para interagir com funcionalidades básicas relacionadas ao token DePix na Liquid Network.

## Endpoints Disponíveis

### 1. Informações do Token DePix

Retorna informações públicas sobre o token DePix.

*   **URL:** `/api/depix-info`
*   **Método:** `GET`
*   **Resposta de Sucesso (200 OK):**
    ```json
    {
      "asset_id": "02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189",
      "name": "Decentralized Pix",
      "ticker": "DePix",
      "precision": 8,
      "explorer_link": "https://blockstream.info/liquid/asset/02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189"
    }
    ```

### 2. Gerar Novo Endereço DePix (Liquid) 

Gera um novo endereço P2WPKH na rede Liquid que pode ser usado para receber DePix (ou L-BTC).

*   **URL:** `/api/generate-depix-address`
*   **Método:** `GET`
*   **Resposta de Sucesso (200 OK):**
    ```json
    {
      "address": "ex1q... (endereço gerado)",
      "message": "Este é um endereço padrão da Liquid (P2WPKH). Para transações confidenciais completas, a gestão de blinding keys é necessária."
    }
    ```
*   **Resposta de Erro (500 Internal Server Error):**
    ```json
    {
      "error": "Falha ao gerar endereço DePix",
      "details": "...(mensagem de erro)..."
    }
    ```

### 3. Gerar QR Code para Pagamento DePix (Liquid)

Gera uma Data URL de um QR Code para um endereço Liquid, opcionalmente com valor, asset ID e mensagem.

*   **URL:** `/api/generate-depix-qrcode`
*   **Método:** `GET`
*   **Parâmetros de Query:**
    *   `address` (obrigatório): O endereço Liquid para o qual o QR Code será gerado.
    *   `amount` (opcional): A quantidade do ativo a ser incluída no QR Code.
    *   `assetid` (opcional): O ID do ativo na Liquid Network. Se `amount` for fornecido e `assetid` não, o asset ID do DePix (`02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189`) será usado por padrão.
    *   `message` (opcional): Uma mensagem a ser incluída no QR Code.
*   **Exemplo de Uso:**
    `/api/generate-depix-qrcode?address=ex1q...&amount=10.5&message=Pagamento%20Referente%20Pedido%20123`
*   **Resposta de Sucesso (200 OK):**
    ```json
    {
      "qr_code_data_url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAPQAAAD0CAYAAACsLwv+... (dados da imagem)",
      "payment_uri": "liquidnetwork:ex1q...?amount=10.5&assetid=02f22f8d9c76ab41661a2729e4752e2c5d1a263012141b86ea98af5472df5189&message=Pagamento%20Referente%20Pedido%20123"
    }
    ```
*   **Resposta de Erro (400 Bad Request):** Se o parâmetro `address` não for fornecido.
    ```json
    {
      "error": "O parâmetro \"address\" é obrigatório."
    }
    ```
*   **Resposta de Erro (500 Internal Server Error):**
    ```json
    {
      "error": "Falha ao gerar QR Code",
      "details": "...(mensagem de erro)..."
    }
    ```

### 4. Status do Servidor

Verifica se o servidor está no ar.

*   **URL:** `/`
*   **Método:** `GET`
*   **Resposta de Sucesso (200 OK):**
    `Servidor DePix-Bridge está no ar!`

## Como Executar Localmente

1.  Clone o repositório (ou tenha os arquivos `server_depix.js` e `package.json`).
2.  No diretório do projeto, execute `npm install` para instalar as dependências.
3.  Execute `node server_depix.js` para iniciar o servidor (padrão na porta 3001).

## Observações de Segurança para Geração de Endereços

A rota `/api/generate-depix-address` gera um novo par de chaves a cada chamada e retorna o endereço público. Em um ambiente de produção real, a gestão de chaves privadas (armazenamento seguro, derivação de uma chave mestra, etc.) é crucial e deve ser implementada com práticas de segurança robustas. **A chave privada NUNCA é exposta por esta API.**
