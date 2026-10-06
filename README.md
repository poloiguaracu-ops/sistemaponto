# Sistema de Registro de Frequência — Polo UniFil

Acesso do funcionário por CPF e senha inicial formada pelos 8 primeiros dígitos do CPF. O funcionário vê relógio em horário de Brasília, REGISTRAR e JUSTIFICAR.

REGISTRAR grava imediatamente a frequência no banco e exibe confirmação. O registro aparece no relatório administrativo.

JUSTIFICAR usa categorias inspiradas nas categorias publicadas pela Seed-PR: Formadores; atestados e declarações médicas (dia todo); atestados e declarações médicas (hora/período); aula cumprida fora da escola; escola fechada por motivo de força maior; justificativa administrativa; justificativa pessoal; sistema indisponível ou com falha; trabalho externo. O funcionário pode anexar PDF. A chefia analisa e aprova ou rejeita.

O sistema usa SQLite persistente em data/ponto.db. A hospedagem deve manter armazenamento persistente.

Antes de publicar, defina JWT_SECRET com chave longa e aleatória e use HTTPS. O CPF é dado pessoal e o acesso administrativo deve ser restrito.

O administrador técnico inicial usa CPF 00000000000. Altere esse cadastro/fluxo antes da produção.
