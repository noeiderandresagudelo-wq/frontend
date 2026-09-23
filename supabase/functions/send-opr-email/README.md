# Envío de OPR por correo

Alarvix ya incorpora el envío opcional de un OPR desde el reporte final.

## Configuración única

La función usa Resend como proveedor de correo y mantiene la API key únicamente en los secretos de Supabase.

Configura estos secretos en el proyecto de Supabase:

- `RESEND_API_KEY`: API key de Resend.
- `OPR_FROM_EMAIL`: remitente verificado, por ejemplo `Alarvix <opr@tu-dominio.com>`.

Luego despliega la función:

```bash
supabase functions deploy send-opr-email
supabase secrets set RESEND_API_KEY=re_xxxxxxxxx
supabase secrets set OPR_FROM_EMAIL="Alarvix <opr@tu-dominio.com>"
```

No coloques `RESEND_API_KEY` dentro de `index.html`.

## Funcionamiento

1. El OPR se guarda normalmente en Alarvix.
2. El botón **Enviar por correo** es opcional.
3. Al pulsarlo, Alarvix solicita/confirma el correo del cliente.
4. El envío se realiza en una Edge Function, no desde el navegador con la API key.
5. Después de un envío exitoso, el OPR guarda el destinatario, fecha e ID del envío dentro de `informe_tecnico`.
6. El OPR puede reenviarse posteriormente sin crear otro registro.

La integración usa la API de correo transaccional de Resend desde una función server-side.
