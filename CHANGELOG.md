# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2025-07-09

### Added

- Added a "Try it out" feature to test requests directly from the form before saving, providing immediate feedback on the response status, headers, and body.

## [1.0.4] - 2025-07-07

### Fixed

- Fixed a bug in the import feature where items were not correctly associated with their parent folders, causing them to be hidden after importing from a JSON file.

## [1.0.3] - 2025-07-06

### Added

- Feature to save monitoring logs to a file.

## [1.0.2] - 2025-07-01

### Added

- A new sidebar view for easier access to core features.
- Functionality to generate cURL commands directly from the sidebar.
- Display of monitoring logs within the new sidebar view.

## [1.0.1] - 2025-06-30

### Added

- Ability to pause and resume monitoring for individual items or all items at once.

## [1.0.0] - 2025-06-29

### Added

- Initial release of the extension.
- Continuous monitoring with configurable intervals.
- Tree view with support for folders and subfolders for organized item grouping.
- Real-time status indicators for each monitored item.
- Native VS Code notifications for service failures and recoveries.
- Support for full HTTP requests including method, headers, query parameters, and body.
- Advanced logging system with per-item, per-folder, and global history.
- Import and export functionality for monitoring items via JSON.
- Ability to import from a cURL command and export any item as a cURL command.
