# Live API & URL Monitor

Your API and Endpoint watchdog, right inside VS Code. Monitor the health of your services without ever leaving your development environment.

![Extension Demonstration](https://raw.githubusercontent.com/marcelo-lourenco/live-api-url-monitor-extension/main/assets/demo.gif)

---

## ✨ Key Features

- **Continuous Monitoring:** Check the status of URLs and APIs at configurable intervals (seconds, minutes, or hours).
- **Tree View:** Organize your endpoints into folders and subfolders for clear and efficient management.
- **Immediate Visual Feedback:** Colored icons show the real-time status of each item and folder. Green for 'OK', Red for 'Error'.
- **Instant Alerts:** Receive a VS Code notification the moment a service becomes unavailable.
- **Detailed Requests:** Full support for HTTP methods (GET, POST, etc.), headers, query params, and request body.
- **Advanced Logging System:**
  - View the request history for all items, a specific folder, or a single endpoint.
  - Control the log level per item: save all results, only errors, or disable logging entirely.
- **Import & Export:**
  - Import and export your monitoring list in JSON format.
  - Quickly import requests from a cURL command.
  - Copy any item as a cURL command for easy debugging.
- **Clean & Intuitive Interface:** All commands are accessible through context menus and a well-organized title bar.

## 🚀 Getting Started

1. Open the **Live API & URL Monitor** extension tab in the VS Code sidebar.
2. Click the `➕` (Add Item) icon in the view's title bar to add your first endpoint.
3. Fill in the name, URL, method, and expected status code.
4. Click **Save**. Monitoring will start immediately!

## 🕹️ Commands & Menus

Most features are just a click away:

### View Title Bar

- **Add Item (`➕`):** Creates a new endpoint for monitoring.
- **Add Folder (`📁`):** Creates a new folder to organize your items.
- **Expand All (`↔️`):** Expands all folders in the view.
- **More Actions (`...`):**
  - **Show Log:** Opens a general log with the history of all requests.
  - **Clear All Logs:** Deletes the entire log history.

### Context Menu (right-click on an item or folder)

- **Refresh:** Forces an immediate status check.
- **Edit:** Opens the form to edit the settings.
- **Duplicate:** Creates a copy of the item or folder (including its children).
- **Show Log:** Shows the log history for only that item or folder.
- **Copy as cURL:** Copies the request as a cURL command for your terminal.
- **Delete:** Removes the item or folder.

## ⚙️ Item Configuration

In the add/edit form, you can configure:

- **Request:** Method, URL, Headers, Query Params, and Body.
- **Validation:** The expected HTTP Status Code to consider the request a success.
- **Authentication:** Support for major authentication types (API Key, Bearer Token, Basic Auth, etc.).
- **Check Interval:** The frequency at which the extension will check the endpoint.
- **Log Level:** Define whether you want to save all logs, only error logs, or no logs for this specific item.

## 📜 Logs

The logging system is a powerful debugging tool. Access the logs through the "More Actions" menu for a general overview, or from an item/folder's context menu for a filtered view.

## 📥/📤 Import & Export

- **Import/Export JSON:** Use the `> URL Monitor: Export Items` and `> URL Monitor: Import Items` commands in the Command Palette (Ctrl+Shift+P) to save and load your configurations.
- **Import cURL:** Use the `> URL Monitor: Import from cURL` command to quickly add a new item from a copied cURL command.

---

Made with ❤️ for developers and teams who need agility.
