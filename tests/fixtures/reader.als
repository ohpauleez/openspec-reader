module outline/reader

open util/ordering[State] as order

// # This is Alloy source, not a Markdown heading.
// sig CommentGhost {}
/*
pred BlockCommentGhost { some univ }
*/

sig Node, Leaf {
  next: set Node
}

sig State {
  nodes: set Node
}

enum Status { Idle, Ready }

fact StringExample {
  some "sig StringGhost {}"
}

fact {
  all n: Node | n not in n.^next
}

// A receiver predicate has a qualified definition name.
pred Node.reachable[n: Node] {
  n in this.*next
}

fun Node.successors: set Node {
  this.next
}

fun roots: set Node {
  Node - Node.next
}

assert ReachabilityClosed {
  all n: Node | {
    n.^next in Node
  }
}

// Outline command labels as well as their targets.
sample: run {
  some Node
} for 4

run reachable for 4

check ReachabilityClosed for 4
