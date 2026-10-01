export const CLASSES = ["D", "C", "B", "A", "S1", "S2", "X"];

// "Dodge Viper (X 998)" se o carro tiver nome, senão "Carro #3631 (X 998)".
export function carLabel(id, names, info) {
  const name = names?.[id] ?? (id === "?" ? "Carro desconhecido" : `Carro #${id}`);
  if (!info) return name;
  return `${name} (${CLASSES[info.class] ?? "?"} ${info.pi})`;
}

export function askCarName(id, names, send) {
  const name = prompt(`Nome do carro #${id} (vazio para remover):`, names?.[id] ?? "");
  if (name !== null) send({ type: "nameCar", id, name });
}
