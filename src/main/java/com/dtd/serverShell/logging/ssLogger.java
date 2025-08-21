package com.dtd.serverShell.logging;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.Marker;
import org.slf4j.event.Level;

import java.util.*;
import java.util.stream.Collectors;

@SuppressWarnings("ALL")
public class ssLogger implements Logger {

    private final Logger full;
    private final Logger debug; // may be null
    private volatile boolean alsoDebug;

    public ssLogger(String fullLoggerName, String debugLoggerName, boolean alsoDebug) {
        if (fullLoggerName == null || fullLoggerName.isBlank()) {
            throw new IllegalArgumentException("fullLoggerName must not be null/blank");
        }
        this.full = LoggerFactory.getLogger(fullLoggerName);
        this.debug = (debugLoggerName != null && !debugLoggerName.isBlank())
                ? LoggerFactory.getLogger(debugLoggerName)
                : null;
        this.alsoDebug = alsoDebug && this.debug != null && !fullLoggerName.equals(debugLoggerName);
    }

    // runtime flip if needed
    public void setAlsoDebug(boolean enabled) {
        this.alsoDebug = enabled && debug != null && !full.getName().equals(debug.getName());
    }

    private boolean mirror() { return alsoDebug && debug != null; }

    // ---------- Identity ----------
    @Override public String getName() { return full.getName(); }

    // ---------- Level checks ----------
    @Override public boolean isTraceEnabled() { return full.isTraceEnabled() || (mirror() && debug.isTraceEnabled()); }
    @Override public boolean isDebugEnabled() { return full.isDebugEnabled() || (mirror() && debug.isDebugEnabled()); }
    @Override public boolean isInfoEnabled()  { return full.isInfoEnabled()  || (mirror() && debug.isInfoEnabled()); }
    @Override public boolean isWarnEnabled()  { return full.isWarnEnabled()  || (mirror() && debug.isWarnEnabled()); }
    @Override public boolean isErrorEnabled() { return full.isErrorEnabled() || (mirror() && debug.isErrorEnabled()); }
    @Override public boolean isEnabledForLevel(Level level) {
        return full.isEnabledForLevel(level) || (mirror() && debug.isEnabledForLevel(level));
    }

    // Marker predicates
    @Override public boolean isTraceEnabled(Marker marker) { return full.isTraceEnabled(marker) || (mirror() && debug.isTraceEnabled(marker)); }
    @Override public boolean isDebugEnabled(Marker marker) { return full.isDebugEnabled(marker) || (mirror() && debug.isDebugEnabled(marker)); }
    @Override public boolean isInfoEnabled (Marker marker) { return full.isInfoEnabled(marker)  || (mirror() && debug.isInfoEnabled(marker)); }
    @Override public boolean isWarnEnabled (Marker marker) { return full.isWarnEnabled(marker)  || (mirror() && debug.isWarnEnabled(marker)); }
    @Override public boolean isErrorEnabled(Marker marker) { return full.isErrorEnabled(marker) || (mirror() && debug.isErrorEnabled(marker)); }

    // ---------- Helpers: FULL always; mirror INFO/WARN/ERROR ----------
    private void toFullAndMaybeDebug(Level lvl, String msg) {
        switch (lvl) {
            case TRACE -> full.trace(msg);
            case DEBUG -> full.debug(msg);
            case INFO  -> { full.info(msg);  if (mirror()) debug.info(msg);  }
            case WARN  -> { full.warn(msg);  if (mirror()) debug.warn(msg);  }
            case ERROR -> { full.error(msg); if (mirror()) debug.error(msg); }
        }
    }
    private void toFullAndMaybeDebug(Level lvl, String fmt, Object a) {
        switch (lvl) {
            case TRACE -> full.trace(fmt, a);
            case DEBUG -> full.debug(fmt, a);
            case INFO  -> { full.info(fmt, a);  if (mirror()) debug.info(fmt, a);  }
            case WARN  -> { full.warn(fmt, a);  if (mirror()) debug.warn(fmt, a);  }
            case ERROR -> { full.error(fmt, a); if (mirror()) debug.error(fmt, a); }
        }
    }
    private void toFullAndMaybeDebug(Level lvl, String fmt, Object a, Object b) {
        switch (lvl) {
            case TRACE -> full.trace(fmt, a, b);
            case DEBUG -> full.debug(fmt, a, b);
            case INFO  -> { full.info(fmt, a, b);  if (mirror()) debug.info(fmt, a, b);  }
            case WARN  -> { full.warn(fmt, a, b);  if (mirror()) debug.warn(fmt, a, b);  }
            case ERROR -> { full.error(fmt, a, b); if (mirror()) debug.error(fmt, a, b); }
        }
    }
    private void toFullAndMaybeDebug(Level lvl, String fmt, Object... args) {
        switch (lvl) {
            case TRACE -> full.trace(fmt, args);
            case DEBUG -> full.debug(fmt, args);
            case INFO  -> { full.info(fmt, args);  if (mirror()) debug.info(fmt, args);  }
            case WARN  -> { full.warn(fmt, args);  if (mirror()) debug.warn(fmt, args);  }
            case ERROR -> { full.error(fmt, args); if (mirror()) debug.error(fmt, args); }
        }
    }
    private void toFullAndMaybeDebug(Level lvl, String msg, Throwable t) {
        switch (lvl) {
            case TRACE -> full.trace(msg, t);
            case DEBUG -> full.debug(msg, t);
            case INFO  -> { full.info(msg, t);  if (mirror()) debug.info(msg, t);  }
            case WARN  -> { full.warn(msg, t);  if (mirror()) debug.warn(msg, t);  }
            case ERROR -> { full.error(msg, t); if (mirror()) debug.error(msg, t); }
        }
    }

    // Marker variants
    private void toFullAndMaybeDebug(Marker m, Level lvl, String msg) {
        switch (lvl) {
            case TRACE -> full.trace(m, msg);
            case DEBUG -> full.debug(m, msg);
            case INFO  -> { full.info(m, msg);  if (mirror()) debug.info(m, msg);  }
            case WARN  -> { full.warn(m, msg);  if (mirror()) debug.warn(m, msg);  }
            case ERROR -> { full.error(m, msg); if (mirror()) debug.error(m, msg); }
        }
    }
    private void toFullAndMaybeDebug(Marker m, Level lvl, String fmt, Object a) {
        switch (lvl) {
            case TRACE -> full.trace(m, fmt, a);
            case DEBUG -> full.debug(m, fmt, a);
            case INFO  -> { full.info(m, fmt, a);  if (mirror()) debug.info(m, fmt, a);  }
            case WARN  -> { full.warn(m, fmt, a);  if (mirror()) debug.warn(m, fmt, a);  }
            case ERROR -> { full.error(m, fmt, a); if (mirror()) debug.error(m, fmt, a); }
        }
    }
    private void toFullAndMaybeDebug(Marker m, Level lvl, String fmt, Object a, Object b) {
        switch (lvl) {
            case TRACE -> full.trace(m, fmt, a, b);
            case DEBUG -> full.debug(m, fmt, a, b);
            case INFO  -> { full.info(m, fmt, a, b);  if (mirror()) debug.info(m, fmt, a, b);  }
            case WARN  -> { full.warn(m, fmt, a, b);  if (mirror()) debug.warn(m, fmt, a, b);  }
            case ERROR -> { full.error(m, fmt, a, b); if (mirror()) debug.error(m, fmt, a, b); }
        }
    }
    private void toFullAndMaybeDebug(Marker m, Level lvl, String fmt, Object... args) {
        switch (lvl) {
            case TRACE -> full.trace(m, fmt, args);
            case DEBUG -> full.debug(m, fmt, args);
            case INFO  -> { full.info(m, fmt, args);  if (mirror()) debug.info(m, fmt, args);  }
            case WARN  -> { full.warn(m, fmt, args);  if (mirror()) debug.warn(m, fmt, args);  }
            case ERROR -> { full.error(m, fmt, args); if (mirror()) debug.error(m, fmt, args); }
        }
    }
    private void toFullAndMaybeDebug(Marker m, Level lvl, String msg, Throwable t) {
        switch (lvl) {
            case TRACE -> full.trace(m, msg, t);
            case DEBUG -> full.debug(m, msg, t);
            case INFO  -> { full.info(m, msg, t);  if (mirror()) debug.info(m, msg, t);  }
            case WARN  -> { full.warn(m, msg, t);  if (mirror()) debug.warn(m, msg, t);  }
            case ERROR -> { full.error(m, msg, t); if (mirror()) debug.error(m, msg, t); }
        }
    }

    // ---------- Standard ----------
    @Override public void trace(String msg)                                    { toFullAndMaybeDebug(Level.TRACE, msg); }
    @Override public void trace(String fmt, Object a)                          { toFullAndMaybeDebug(Level.TRACE, fmt, a); }
    @Override public void trace(String fmt, Object a, Object b)                { toFullAndMaybeDebug(Level.TRACE, fmt, a, b); }
    @Override public void trace(String fmt, Object... args)                    { toFullAndMaybeDebug(Level.TRACE, fmt, args); }
    @Override public void trace(String msg, Throwable t)                       { toFullAndMaybeDebug(Level.TRACE, msg, t); }

    @Override public void debug(String msg)                                    { toFullAndMaybeDebug(Level.DEBUG, msg); }
    @Override public void debug(String fmt, Object a)                          { toFullAndMaybeDebug(Level.DEBUG, fmt, a); }
    @Override public void debug(String fmt, Object a, Object b)                { toFullAndMaybeDebug(Level.DEBUG, fmt, a, b); }
    @Override public void debug(String fmt, Object... args)                    { toFullAndMaybeDebug(Level.DEBUG, fmt, args); }
    @Override public void debug(String msg, Throwable t)                       { toFullAndMaybeDebug(Level.DEBUG, msg, t); }

    @Override public void info(String msg)                                     { toFullAndMaybeDebug(Level.INFO, msg); }
    @Override public void info(String fmt, Object a)                           { toFullAndMaybeDebug(Level.INFO, fmt, a); }
    @Override public void info(String fmt, Object a, Object b)                 { toFullAndMaybeDebug(Level.INFO, fmt, a, b); }
    @Override public void info(String fmt, Object... args)                     { toFullAndMaybeDebug(Level.INFO, fmt, args); }
    @Override public void info(String msg, Throwable t)                        { toFullAndMaybeDebug(Level.INFO, msg, t); }

    @Override public void warn(String msg)                                     { toFullAndMaybeDebug(Level.WARN, msg); }
    @Override public void warn(String fmt, Object a)                           { toFullAndMaybeDebug(Level.WARN, fmt, a); }
    @Override public void warn(String fmt, Object a, Object b)                 { toFullAndMaybeDebug(Level.WARN, fmt, a, b); }
    @Override public void warn(String fmt, Object... args)                     { toFullAndMaybeDebug(Level.WARN, fmt, args); }
    @Override public void warn(String msg, Throwable t)                        { toFullAndMaybeDebug(Level.WARN, msg, t); }

    @Override public void error(String msg)                                    { toFullAndMaybeDebug(Level.ERROR, msg); }
    @Override public void error(String fmt, Object a)                          { toFullAndMaybeDebug(Level.ERROR, fmt, a); }
    @Override public void error(String fmt, Object a, Object b)                { toFullAndMaybeDebug(Level.ERROR, fmt, a, b); }
    @Override public void error(String fmt, Object... args)                    { toFullAndMaybeDebug(Level.ERROR, fmt, args); }
    @Override public void error(String msg, Throwable t)                       { toFullAndMaybeDebug(Level.ERROR, msg, t); }

    // ---------- Marker ----------
    @Override public void trace(Marker m, String msg)                          { toFullAndMaybeDebug(m, Level.TRACE, msg); }
    @Override public void trace(Marker m, String fmt, Object a)                { toFullAndMaybeDebug(m, Level.TRACE, fmt, a); }
    @Override public void trace(Marker m, String fmt, Object a, Object b)      { toFullAndMaybeDebug(m, Level.TRACE, fmt, a, b); }
    @Override public void trace(Marker m, String fmt, Object... args)          { toFullAndMaybeDebug(m, Level.TRACE, fmt, args); }
    @Override public void trace(Marker m, String msg, Throwable t)             { toFullAndMaybeDebug(m, Level.TRACE, msg, t); }

    @Override public void debug(Marker m, String msg)                          { toFullAndMaybeDebug(m, Level.DEBUG, msg); }
    @Override public void debug(Marker m, String fmt, Object a)                { toFullAndMaybeDebug(m, Level.DEBUG, fmt, a); }
    @Override public void debug(Marker m, String fmt, Object a, Object b)      { toFullAndMaybeDebug(m, Level.DEBUG, fmt, a, b); }
    @Override public void debug(Marker m, String fmt, Object... args)          { toFullAndMaybeDebug(m, Level.DEBUG, fmt, args); }
    @Override public void debug(Marker m, String msg, Throwable t)             { toFullAndMaybeDebug(m, Level.DEBUG, msg, t); }

    @Override public void info(Marker m, String msg)                           { toFullAndMaybeDebug(m, Level.INFO, msg); }
    @Override public void info(Marker m, String fmt, Object a)                 { toFullAndMaybeDebug(m, Level.INFO, fmt, a); }
    @Override public void info(Marker m, String fmt, Object a, Object b)       { toFullAndMaybeDebug(m, Level.INFO, fmt, a, b); }
    @Override public void info(Marker m, String fmt, Object... args)           { toFullAndMaybeDebug(m, Level.INFO, fmt, args); }
    @Override public void info(Marker m, String msg, Throwable t)              { toFullAndMaybeDebug(m, Level.INFO, msg, t); }

    @Override public void warn(Marker m, String msg)                           { toFullAndMaybeDebug(m, Level.WARN, msg); }
    @Override public void warn(Marker m, String fmt, Object a)                 { toFullAndMaybeDebug(m, Level.WARN, fmt, a); }
    @Override public void warn(Marker m, String fmt, Object a, Object b)       { toFullAndMaybeDebug(m, Level.WARN, fmt, a, b); }
    @Override public void warn(Marker m, String fmt, Object... args)           { toFullAndMaybeDebug(m, Level.WARN, fmt, args); }
    @Override public void warn(Marker m, String msg, Throwable t)              { toFullAndMaybeDebug(m, Level.WARN, msg, t); }

    @Override public void error(Marker m, String msg)                          { toFullAndMaybeDebug(m, Level.ERROR, msg); }
    @Override public void error(Marker m, String fmt, Object a)                { toFullAndMaybeDebug(m, Level.ERROR, fmt, a); }
    @Override public void error(Marker m, String fmt, Object a, Object b)      { toFullAndMaybeDebug(m, Level.ERROR, fmt, a, b); }
    @Override public void error(Marker m, String fmt, Object... args)          { toFullAndMaybeDebug(m, Level.ERROR, fmt, args); }
    @Override public void error(Marker m, String msg, Throwable t)             { toFullAndMaybeDebug(m, Level.ERROR, msg, t); }

    // ---------- Convenience overloads ----------
    public void info(Map<?,?> m)   { if (isInfoEnabled())  info("{}", pretty(m)); }
    public void info(List<?> l)    { if (isInfoEnabled())  info("{}", pretty(l)); }
    public void info(Object[] a)   { if (isInfoEnabled())  info("{}", pretty(a)); }
    public void debug(Map<?,?> m)  { if (isDebugEnabled()) debug("{}", pretty(m)); }
    public void debug(List<?> l)   { if (isDebugEnabled()) debug("{}", pretty(l)); }
    public void debug(Object[] a)  { if (isDebugEnabled()) debug("{}", pretty(a)); }
    public void warn(Map<?,?> m)   { if (isWarnEnabled())  warn("{}", pretty(m)); }
    public void error(Map<?,?> m)  { if (isErrorEnabled()) error("{}", pretty(m)); }

    private static String pretty(Object[] arr)       { return Arrays.deepToString(arr); }
    private static String pretty(Collection<?> c)    { return c.stream().map(String::valueOf).collect(Collectors.joining(", ", "[", "]")); }
    private static String pretty(Map<?,?> m)         {
        return m.entrySet().stream()
                .map(e -> String.valueOf(e.getKey()) + "=" + String.valueOf(e.getValue()))
                .collect(Collectors.joining(", ", "{", "}"));
    }
}