# Hey Planner

A voice-activated AI task planner — say "Hey Planner" and speak your tasks. Installable as a PWA on any device.

## Quick Start

Serve the files with any static server, then open in Chrome/Edge:

```
npx serve .
```

### Install as App

- **Windows/Mac**: Chrome → three-dot menu → "Install Hey Planner"
- **Android**: Chrome → "Add to Home Screen"
- **iOS**: Safari → Share → "Add to Home Screen"

## Features

- "Hey Planner" wake-word activation
- Voice-to-task creation with AI grammar correction
- Smart intent parsing (completing, creating, updating tasks)
- Week planner, daily planner, and custom lists
- Offline-ready (service worker caches all assets)
- Works on any device with a browser
  - "gonna" → "going to"
  - "wanna" → "want to"

### Managing Lists

- Click the "+" next to "My Lists" in the sidebar
- Enter a name and emoji for your list
- Click "Create"
- Click on any list to view its tasks
- Assign tasks to lists when creating/editing them

### Tracking Progress

- The sidebar shows today's overall progress
- Each day card displays its tasks
- Check off tasks as you complete them
- View detailed statistics in the Daily Planner view

### Exporting Data

- Go to Daily Planner view
- Select a date
- Click "Export to Markdown"
- A markdown file will be downloaded with all tasks for that day

## Speech Recognition Tips

The speech-to-text feature works best when you:

- Speak clearly and naturally
- Use action words like "completed," "worked on," "fixed," "updated"
- Separate tasks with commas or "and"
- Example phrases:
  - "I worked on the homepage redesign"
  - "Fixed the authentication bug and updated tests"
  - "Completed the quarterly report, sent emails, had team meeting"

## Data Storage

All data is stored locally in your browser using `localStorage`. This means:

- ✅ Your data is private and stays on your device
- ✅ No internet connection required
- ⚠️ Clearing browser data will delete your tasks
- ⚠️ Data is not synced across devices

To backup your data:

- Export individual days to markdown
- Use browser developer tools to export localStorage data

## Browser Compatibility

**Fully Supported:**

- Chrome/Edge (latest)
- Safari (latest)
- Firefox (latest)

**Speech Recognition:**

- Chrome/Edge: ✅ Full support
- Safari: ✅ Full support (iOS 14.5+)
- Firefox: ⚠️ Limited support

If speech recognition isn't available, you can still use all other features with manual input.

## Customization

### Changing Colors

Edit `styles.css` and modify the CSS variables:

```css
:root {
  --primary-color: #4a90e2; /* Main theme color */
  --secondary-color: #7b68ee; /* Accent color */
  --success-color: #50c878; /* Success/voice button */
  --danger-color: #e74c3c; /* Delete/danger actions */
}
```

### Adding New Views

The app architecture makes it easy to add new views:

1. Add a navigation button in `index.html`
2. Create a view container with a unique ID
3. Add a case in `switchView()` in `app.js`
4. Implement your render function

## Architecture

```
index.html          - Main HTML structure and UI layout
styles.css          - All styling and responsive design
app.js              - Main application controller and UI logic
storage.js          - Data persistence and markdown export
speech.js           - Speech recognition and task parsing
```

### Key Classes

**PlannerApp** - Main application controller

- Manages views and navigation
- Handles UI interactions
- Coordinates between storage and speech modules

**StorageManager** - Data management

- CRUD operations for tasks and lists
- Markdown export/import
- Statistics calculation

**SpeechManager** - Voice input

- Speech recognition wrapper
- Natural language task parsing
- Real-time transcription

## Tips & Tricks

1. **Quick Navigation**: Use keyboard shortcuts by adding them in the code
2. **Bulk Operations**: Select a week to mark all tasks as done
3. **Templates**: Create recurring tasks as list templates
4. **Daily Review**: Export each day to markdown for journaling
5. **Focus Mode**: Use custom lists like "Today," "This Week," "Important"

## Future Enhancements

Potential features to add:

- [ ] Cloud sync (Google Drive, Dropbox)
- [ ] Recurring tasks
- [ ] Reminders and notifications
- [ ] Pomodoro timer integration
- [ ] Team collaboration
- [ ] Mobile app (PWA)
- [ ] Dark mode
- [ ] Drag-and-drop task reordering
- [ ] Calendar integration
- [ ] Analytics dashboard

## Troubleshooting

**Speech recognition not working:**

- Make sure you're using HTTPS or localhost
- Grant microphone permissions in browser
- Check browser compatibility
- Try Chrome/Edge for best support

**Tasks not saving:**

- Check browser localStorage isn't full
- Ensure cookies/local storage aren't blocked
- Try a different browser

**Layout issues:**

- Clear browser cache
- Ensure JavaScript is enabled
- Check browser console for errors

## Contributing

This is a personal project, but feel free to:

- Fork and customize for your needs
- Report bugs or suggest features
- Share improvements

## License

Free to use and modify for personal or commercial use.

## Acknowledgments

- Inspired by WeekToDo and similar task management apps
- Uses browser's native Speech Recognition API
- Built with vanilla JavaScript (no frameworks!)

---

**Made with ❤️ for productive planning**

Start planning smarter today! 🚀
