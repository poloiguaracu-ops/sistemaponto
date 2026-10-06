# Sistema de Ponto — Polo UniFil

Sistema web para registrar entrada, início/fim de intervalo e saída dos funcionários.

Inclui login por matrícula e PIN, registro com data/hora do servidor, histórico diário, painel administrativo, cadastro de funcionários, relatório diário e interface responsiva.

## Rodar localmente

Requer Node.js 20 ou superior.

Comandos:

    npm install
    npm start

Depois abra http://localhost:3000

## Primeiro acesso administrativo

Matrícula: ADMIN
PIN: 1234

Troque esse PIN antes de colocar o sistema em produção.

## Publicação

A hospedagem precisa executar Node.js e manter o diretório data/ em armazenamento persistente. Se a hospedagem apagar o disco ao reiniciar, o banco não deve ser usado como armazenamento permanente sem um volume persistente.

Configure também uma variável de ambiente forte chamada JWT_SECRET.

Para uma implantação trabalhista definitiva, configure o fuso horário da hospedagem para America/Sao_Paulo e valide a política de ponto da empresa.
