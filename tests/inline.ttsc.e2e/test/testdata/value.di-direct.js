class ValueRepo {
}
export const valueFn = services.addValue("chain-app/tokens/value:makeThing", makeThing);
export const valueClass = services.addValue("chain-app/tokens/value:ValueRepo", ValueRepo);
