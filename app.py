import curses
import textwrap
from datetime import datetime


HELP_TEXT = (
    "Commands: /help, /clear, /save, /quit. "
    "Type normal text to chat with the local bot."
)


def timestamp():
    return datetime.now().strftime("%H:%M")


def build_reply(message):
    text = message.strip()
    lower = text.lower()

    if not text:
        return "Say something and I will reply."
    if "hello" in lower or "hi" in lower:
        return "Hello. The terminal UI is working."
    if "time" in lower:
        return f"Current local time is {datetime.now().strftime('%I:%M %p')}."
    if "date" in lower:
        return f"Today is {datetime.now().strftime('%B %d, %Y')}."
    if lower.endswith("?"):
        return (
            "I do not have a real AI backend here, but the terminal chat loop is live. "
            "You can replace build_reply() with an API call later."
        )
    return f'You said: "{text}"'


def add_wrapped_message(store, speaker, message, width):
    prefix = f"[{timestamp()}] {speaker}: "
    wrapped = textwrap.wrap(message, max(10, width - len(prefix) - 1)) or [""]
    for index, line in enumerate(wrapped):
        if index == 0:
            store.append(prefix + line)
        else:
            store.append(" " * len(prefix) + line)


def save_chat(messages):
    filename = f"chat-{datetime.now().strftime('%Y%m%d-%H%M%S')}.txt"
    with open(filename, "w", encoding="utf-8") as file:
        file.write("\n".join(messages) + "\n")
    return filename


def draw(stdscr, messages, current_input, notice):
    stdscr.erase()
    height, width = stdscr.getmaxyx()

    if height < 8 or width < 40:
        stdscr.addstr(0, 0, "Resize the terminal to at least 40x8.")
        stdscr.refresh()
        return

    chat_height = height - 4
    visible_messages = messages[-chat_height:]

    for row, line in enumerate(visible_messages):
        stdscr.addnstr(row, 0, line, width - 1)

    stdscr.hline(chat_height, 0, "-", width)
    stdscr.addnstr(chat_height + 1, 0, f"Input: {current_input}", width - 1)
    stdscr.hline(chat_height + 2, 0, "-", width)
    stdscr.addnstr(chat_height + 3, 0, notice, width - 1)
    stdscr.move(chat_height + 1, min(width - 1, len("Input: ") + len(current_input)))
    stdscr.refresh()


def chat(stdscr):
    curses.curs_set(1)
    curses.use_default_colors()
    stdscr.keypad(True)

    messages = []
    current_input = ""
    notice = HELP_TEXT

    height, width = stdscr.getmaxyx()
    add_wrapped_message(messages, "Bot", "Terminal chat started.", width)

    while True:
        draw(stdscr, messages, current_input, notice)
        key = stdscr.get_wch()

        if key in ("\n", "\r"):
            text = current_input.strip()
            current_input = ""
            height, width = stdscr.getmaxyx()

            if not text:
                notice = "Empty message ignored."
                continue

            if text == "/quit":
                break
            if text == "/help":
                notice = HELP_TEXT
                continue
            if text == "/clear":
                messages.clear()
                notice = "Chat cleared."
                continue
            if text == "/save":
                path = save_chat(messages)
                notice = f"Saved chat to {path}"
                continue

            add_wrapped_message(messages, "You", text, width)
            reply = build_reply(text)
            add_wrapped_message(messages, "Bot", reply, width)
            notice = "Chat updated."
        elif key in (curses.KEY_BACKSPACE, "\b", "\x7f"):
            current_input = current_input[:-1]
        elif key == curses.KEY_RESIZE:
            notice = "Window resized."
        elif isinstance(key, str) and key.isprintable():
            current_input += key


def main():
    curses.wrapper(chat)


if __name__ == "__main__":
    main()
