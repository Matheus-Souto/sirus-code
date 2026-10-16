/** Phone app additions (ADR-124): the working pill and the offline outbox order. English source, Portuguese translation. */
const strings: Record<string, [string, string]> = {
  "mobile.workingPill": ["Working for {duration}. Show the latest activity", "Trabalhando há {duration}. Mostrar a atividade mais recente"],
  "mobile.outboxUp": ["Send this message earlier", "Enviar esta mensagem antes"],
  "mobile.outboxDown": ["Send this message later", "Enviar esta mensagem depois"],
};
export const phoneExtrasEnglish: Record<string, string> = Object.fromEntries(Object.entries(strings).map(([key, value]) => [key, value[0]]));
export const phoneExtrasPortuguese: Record<string, string> = Object.fromEntries(Object.entries(strings).map(([key, value]) => [key, value[1]]));
