module temporal

sig Node {}
one sig Clock { var active: set Node, var messages: Node -> Node }

fact behavior {
  no Clock.active
  always Clock.active' = Node - Clock.active
  always Clock.messages = Clock.active -> Clock.active
}

run sample { some Node } for exactly 1 Node, 4 steps

assert Empty { always no Clock.active }
check Empty for exactly 1 Node, 4 steps

assert Periodic { always Clock.active'' = Clock.active }
check Periodic for exactly 1 Node, 4 steps

run impossible { some Node and no Node } for 2
