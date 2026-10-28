package example;

/**
 * A <strong>reader</strong> that returns {@code java.lang.String} values. This deliberately long description explains the reader in enough detail to wrap onto multiple lines in a narrow browser viewport. Documentation should stay readable even when a nearby source line is much wider than the screen. It also retains a {@link #read(int) member link} and inline formatting.
 * @since 1.0
 */
public class Formatting {
    private static final String LONG_LINE = "This is a deliberately very long source code line that must remain horizontally scrollable without forcing documentation cards to be equally wide. This is a deliberately very long source code line that must remain horizontally scrollable without forcing documentation cards to be equally wide. This is a deliberately very long source code line that must remain horizontally scrollable without forcing documentation cards to be equally wide.";

    /** A configurable label. The remaining field description wraps independently of the source line width. */
    private String label = "";

    private int value = 0;
    //@ public invariant value >= 0;

    /**
     * Reads at most {@code limit} values. The full method description follows on a separate line and should wrap normally.
     * @param limit a nonnegative limit on the amount of information returned to the caller
     * @return the configured label
     */
    /*@ public normal_behavior
      @ requires limit >= 0;
      @ assignable \nothing;
      @ ensures \result != null;
      @*/
    public String read(int limit) {
        return label;
    }

    /** Available operation modes. Each constant has its own description. */
    public enum Mode {
        /** Ready for requests. Further details for the ready state are shown as ordinary wrapped prose. */
        READY,
        /** Temporarily paused. No new work is accepted until resumed. */
        PAUSED,
        /** Fully closed. Use {@link #read(int) read} before closing the reader. */
        CLOSED;
    }

    /** An enum with behavior keeps its source representation. */
    public enum Detailed {
        /** The only item. */
        ITEM(1);

        /** The numeric code. This field description uses ordinary prose throughout. */
        private final int code;
        Detailed(int code) { this.code = code; }
        public int code() { return code; }
    }

    /** A nested reader interface. Its documentation identifies the interface. */
    public interface Reader {
        /** Reads the next value. The next sentence is ordinary prose. */
        int next();
    }
}
