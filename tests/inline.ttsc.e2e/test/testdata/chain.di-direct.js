class ConsoleLogger {
}

class SelfRepo {
  constructor(clock) {}
}

class ThingRepo {
  constructor(store) {}
}
export const closed = services.addClass("chain-app/tokens/chain:ILogger", ConsoleLogger, [[]]).withSignature("chain-app/tokens/chain:IClock").as("singleton");
export const emptySig = services.addClass("chain-app/tokens/chain:ILogger", ConsoleLogger, [[]]).withSignature().as("singleton");
export const self = services.addClass("chain-app/tokens/chain:SelfRepo", SelfRepo, [["chain-app/tokens/chain:IClock"]]);
export const open = services.addClass("chain-app/tokens/chain:IRepo<$1>", ThingRepo, [["chain-app/tokens/chain:IStore<$1>"]]);
