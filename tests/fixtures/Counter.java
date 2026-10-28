package example;

import java.util.Objects;

/**
 * A bounded <strong>counter</strong> with readable documentation and contracts.
 * <p>Call {@link #add(int) add} to increase the value.</p>
 * <ul><li>Values remain nonnegative.</li><li>Source text is preserved.</li></ul>
 * The literal {@code <Counter>} is code, not an HTML element.
 * <script>window.osrJavaUnsafe = true;</script>
 * <img src="missing.png" onerror="window.osrJavaUnsafe = true">
 * @since 1.0
 */
public class Counter {
    private /*@ spec_public @*/ int value;

    //@ public invariant value >= 0;
    //+ESC@ public invariant value <= Integer.MAX_VALUE;

    /*@ public model int total;
      @ private represents total = value;
      @*/

    /**
     * Creates a counter with the given initial value.
     * @param initial a nonnegative starting value
     * @throws IllegalArgumentException if the value is negative
     */
    /*@ public normal_behavior
      @ requires initial >= 0;
      @ assignable value;
      @ ensures value == initial;
      @*/
    public Counter(int initial) {
        if (initial < 0) throw new IllegalArgumentException();
        value = initial;
    }

    /**
     * Adds {@code amount} to the counter.
     * @param amount how much to add
     * @return the new value
     * @throws IllegalArgumentException for a negative amount
     * @see #size()
     */
    /*@ public normal_behavior
      @ requires 0 <= amount && amount <= Integer.MAX_VALUE - value;
      @ assignable value;
      @ ensures value == \old(value) + amount;
      @ ensures \result == value;
      @ also
      @ public exceptional_behavior
      @ requires amount < 0;
      @ assignable \nothing;
      @ signals (IllegalArgumentException e) true;
      @ signals_only IllegalArgumentException;
      @*/
    public int add(int amount) {
        if (amount < 0 || amount > Integer.MAX_VALUE - value) throw new IllegalArgumentException();
        value += amount;
        return value;
    }

    /** Returns the current value. */
    //@ ensures \result == value;
    public /*@ spec_pure @*/ int size() {
        return value;
    }

    /** Demonstrates a quantified expression and loop clauses. */
    public static boolean nonnegative(int[] values) {
        int i = 0;
        //@ loop_invariant 0 <= i <= values.length;
        //@ loop_invariant (\forall int k; 0 <= k < i; values[k] >= 0);
        //@ loop_writes i;
        //@ decreases values.length - i;
        while (i < values.length) {
            if (values[i] < 0) return false;
            i++;
        }
        return true;
    }

    public int add(int amount, int limit) {
        int local = Math.min(amount, limit);
        return add(local);
    }

    public record Snapshot(int value) {
        public Snapshot { Objects.requireNonNull(this); }
    }

    public enum Mode { OPEN, CLOSED }

    public interface Resettable { void reset(); }

    public @interface Name { String value(); }

    private static final String FAKE = "class Ghost { /*@ ensures false; @*/ }";
}
