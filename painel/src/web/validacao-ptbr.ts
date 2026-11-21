// Mensagens de validação dos formulários em português (o navegador usa o idioma dele: "Please fill out this field").
// Vale para todo campo com required, type=email, min, max, pattern etc. A rolagem até o campo com erro desconta o topo
// fixo pelo CSS (scroll-padding-top / scroll-margin-top em estilo.css).

type Campo = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function mensagemDoCampo(el: Campo): string {
  const v = el.validity;
  if (v.valueMissing) return el instanceof HTMLSelectElement ? "Escolha uma opção." : el instanceof HTMLInputElement && (el.type === "checkbox" || el.type === "radio") ? "Marque esta opção para continuar." : "Preencha este campo.";
  if (v.typeMismatch) return el instanceof HTMLInputElement && el.type === "email" ? "Informe um e-mail válido, como nome@exemplo.com." : el instanceof HTMLInputElement && el.type === "url" ? "Informe um endereço válido, começando com https://." : "Valor inválido.";
  if (v.patternMismatch) return el.title || "O valor não está no formato esperado.";
  if (v.tooShort) return `Use pelo menos ${(el as HTMLInputElement).minLength} caracteres.`;
  if (v.tooLong) return `Use no máximo ${(el as HTMLInputElement).maxLength} caracteres.`;
  if (v.rangeUnderflow) return `O valor mínimo é ${(el as HTMLInputElement).min}.`;
  if (v.rangeOverflow) return `O valor máximo é ${(el as HTMLInputElement).max}.`;
  if (v.stepMismatch) return "Informe um valor válido.";
  if (v.badInput) return "Valor inválido.";
  return "";
}

let ligada = false;
export function ligarValidacaoPtBr() {
  if (ligada || typeof document === "undefined") return;
  ligada = true;
  // O evento "invalid" não borbulha: precisa da fase de captura.
  document.addEventListener("invalid", (e) => {
    const el = e.target as Campo;
    if (!el?.validity) return;
    el.setCustomValidity("");
    const m = mensagemDoCampo(el);
    if (m) el.setCustomValidity(m);
  }, true);
  // Ao corrigir, tira a mensagem para o formulário poder ser enviado.
  const limpar = (e: Event) => { const el = e.target as Campo; if (el?.setCustomValidity) el.setCustomValidity(""); };
  document.addEventListener("input", limpar, true);
  document.addEventListener("change", limpar, true);
}
