/** Shared bench fixtures — used by run.ts and parseman-perf.ts */

export const SMALL_JSON = JSON.stringify({ name: 'Alice', age: 30, active: true, score: 98.6 })
export const MEDIUM_JSON = JSON.stringify({
  users: Array.from({ length: 20 }, (_, i) => ({
    id: i + 1, name: `User ${i}`, email: `user${i}@example.com`,
    scores: [42.1, 88.7],
    active: i % 2 === 0,
  })),
})
export const LARGE_JSON = JSON.stringify({
  items: Array.from({ length: 200 }, (_, i) => ({
    id: i, value: `item-${i}`, nested: { a: i * 2, b: `str-${i}` },
  })),
})

export const SMALL_CSV = `name,age,city\nAlice,30,NYC\nBob,25,LA\nCarol,35,Chicago\n`
export const LARGE_CSV = Array.from({ length: 500 }, (_, i) =>
  `user${i},${20 + (i % 50)},city${i % 20},${(i * 1.5).toFixed(2)},${i % 2 === 0 ? 'true' : 'false'}`
).join('\n') + '\n'

export const SMALL_GQL = `{ user { name email age } }`
export const MEDIUM_GQL = `
query GetData {
  user(id: 42) {
    name
    email
    posts {
      title
      body
      comments(limit: 10) {
        author
        text
        createdAt
      }
    }
    friends {
      name
      age
    }
  }
  account(active: true) {
    id
    role
    email
    permissions {
      read
      write
      admin
    }
  }
}`.trim()
export const LARGE_GQL = Array.from({ length: 25 }, (_, i) => `
query Op${i}($id: ID!, $flag: Boolean) {
  node${i}(id: $id, page: ${i % 10}) {
    field1
    field2
    field3
    nested1 {
      sub1
      sub2
      sub3
      sub4
    }
    nested2(param: ${i * 2}, flag: $flag) {
      a
      b
      c
      d
      e
    }
    nested3 {
      deep1 { x y }
      deep2 { p q }
    }
  }
}`.trim()).join('\n')

export const SMALL_CONFIG = `# demo config
[app]
name = "demo"
port = 8080
debug = true
`
export const MEDIUM_CONFIG = Array.from({ length: 40 }, (_, i) =>
  `[section${i}]\nkey${i} = ${i}\nflag${i} = ${i % 2 === 0 ? 'true' : 'false'}\n`
).join('\n')

export const SMALL_EXPR = 'if x > 0 then foo(1, 2) + bar * 3 else baz && qux || 1'
export const MEDIUM_EXPR = Array.from({ length: 30 }, (_, i) =>
  `if n${i} > 0 then f${i}(a${i}, b${i}) + g${i} * ${i} else h${i} && k${i} || ${i}`
).join(' + ')
