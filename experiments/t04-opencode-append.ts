
/** T04: appended to the pinned native registry harness in a disposable checkout. */
it.effect("T04 restrict visibility and forced invocation across direct and Code Mode", () =>
  Effect.gen(function* () {
    const service = yield* Tool.Service
    const effects: string[] = []
    const synthetic = (name: string): Info => ({
      ...make(),
      execute: ({ text }) => Effect.sync(() => {
        effects.push(name)
        return { output: { text }, content: text }
      }),
    })
    yield* transform(service, { t04_read: synthetic("read") }, { codemode: false })
    yield* transform(service, { t04_write_direct: synthetic("direct") }, { codemode: false, permission: "t04_write" })
    yield* transform(service, { t04_write_code: synthetic("code") }, { permission: "t04_write" })
    const P = Permission.Policy
    const allow = P.fromRules([{ action: "*", resource: "*", effect: "allow" }])
    const restrict = P.restrict(allow, [{ action: "t04_write", resource: "*" }])
    const effective = P.fallback(P.override(restrict, [{ action: "t04_write", resource: "*", effect: "allow" }]), allow)
    expect(P.evaluate(effective, "t04_write", "synthetic").effect).toBe("deny")
    const all = yield* service.snapshot(allow)
    const limited = yield* service.snapshot(effective)
    const program = (snapshot: Tool.Snapshot, code: string) => snapshot.execute({
      ...call("execute"),
      call: { type: "tool-call", id: "call-t04-program", name: "execute", input: { code } },
    })
    expect(all.definitions.map(x => x.name)).toContain("t04_write_direct")
    expect(codeModeListings(all.codeModeCatalog!).map(x => x.path)).toContain("t04_write_code")
    yield* all.execute(call("t04_write_direct"))
    yield* program(all, 'return await tools.t04_write_code({ text: "control" })')
    expect(effects).toEqual(["direct", "code"])
    effects.length = 0
    expect(limited.definitions.map(x => x.name)).not.toContain("t04_write_direct")
    expect(codeModeListings(limited.codeModeCatalog!).map(x => x.path)).not.toContain("t04_write_code")
    yield* limited.execute(call("t04_read"))
    for (const name of ["t04_write_direct", "t04_write_code"]) {
      expect(Exit.isFailure(yield* limited.execute(call(name)).pipe(Effect.exit))).toBe(true)
    }
    const blocked = yield* program(limited, 'try { await tools.t04_write_code({ text: "denied" }); return "unexpected" } catch (e) { return "blocked" }')
    expect(blocked.output).toMatchObject({ output: "blocked" })
    expect(effects).toEqual(["read"])
    const size = (snapshot: Tool.Snapshot) => Buffer.byteLength(JSON.stringify({
      definitions: snapshot.definitions,
      catalog: snapshot.codeModeCatalog,
    }))
    console.log("T04-OPENCODE", JSON.stringify({ allBytes: size(all), limitedBytes: size(limited), effects }))
    expect(size(limited)).toBeLessThan(size(all))
  }),
)
