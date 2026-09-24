-- Bucket para notas de voz del chat de Alarvix
insert into storage.buckets (id, name, public)
values ('mensajes-audio', 'mensajes-audio', true)
on conflict (id) do update set public = true;

-- Usuarios autenticados pueden subir y leer audios del chat.
drop policy if exists "alarvix_audio_insert_authenticated" on storage.objects;
create policy "alarvix_audio_insert_authenticated"
on storage.objects for insert to authenticated
with check (bucket_id = 'mensajes-audio');

drop policy if exists "alarvix_audio_select_public" on storage.objects;
create policy "alarvix_audio_select_public"
on storage.objects for select to public
using (bucket_id = 'mensajes-audio');

drop policy if exists "alarvix_audio_delete_authenticated" on storage.objects;
create policy "alarvix_audio_delete_authenticated"
on storage.objects for delete to authenticated
using (bucket_id = 'mensajes-audio');
