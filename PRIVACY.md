# Privacy Policy for DeviateProxy

*Last updated: September 18, 2024*

**DeviateProxy** is an open-source browser extension designed to route web traffic through user-configured proxy servers based on domain and host rules, with support for PAC and TXT list import.

We respect your privacy and are committed to protecting it. This Privacy Policy explains how DeviateProxy handles user information.

---

### 1. No Data Collection or Transmission
- DeviateProxy **does not collect, track, log, or transmit** any personal data, browsing history, IP addresses, or identifiable user information to any external server or third party.
- The extension contains **no analytics, telemetry, advertising scripts, or trackers**.

### 2. Local Storage and Processing
All settings, proxy configurations, rules, and user preferences are stored and processed **exclusively on your local device** using the browser's built-in storage APIs (`chrome.storage.local` / `browser.storage.local`):
- **Proxy Credentials:** Usernames and passwords entered for proxy authentication remain strictly on your local machine and are only transmitted directly to the proxy server you explicitly configure when authenticating network connections.
- **Routing Rules and Domain Lists:** Custom rules, imported TXT lists, and PAC scripts are stored and evaluated locally on your computer.
- **Tab Domain Inspector:** The list of loaded domains and requests displayed in the popup inspector is generated dynamically in temporary memory for the active tab only. It is never logged, saved permanently, or transmitted over the network.

### 3. Chrome Permissions Explanation
DeviateProxy requests only the permissions strictly necessary to provide its core proxy routing functionality:
- **`proxy`**: Allows the extension to configure browser proxy settings and route web traffic according to your designated rules and proxy profiles.
- **`host_permissions` (`http://*/*`, `https://*/*`, `ws://*/*`, `wss://*/*`) & `webRequest`**: Required to inspect requested URLs against your routing rules to determine whether they should use a proxy or direct connection, and to display requests in the active tab inspector.
- **`webRequestAuthProvider`**: Required to supply authentication credentials (username and password) to your configured proxy servers when requested.
- **`tabs`**: Used solely to determine the hostname of the currently active tab in order to populate the popup inspector and show the proxied request counter badge.
- **`storage` and `unlimitedStorage`**: Used to save your proxy profiles, custom routing rules, and imported domain lists locally within the browser.
- **`alarms`**: Used to schedule periodic background checks and updates for external domain lists configured by the user.
- **`offscreen`**: Used in Chromium-based browsers for sandboxed parsing and evaluation of PAC scripts in Manifest V3.

### 4. Third-Party Services
DeviateProxy does not communicate with any third-party services, except:
- Connecting directly to the proxy servers configured by you.
- Fetching rule lists from external URLs that you explicitly add in the extension settings.

### 5. Open Source
The source code of DeviateProxy is fully open and available for public review:  
[https://github.com/devintly/deviateproxy](https://github.com/devintly/deviateproxy)

### 6. Contact
If you have any questions or concerns regarding this Privacy Policy, you can open an issue on GitHub:  
[https://github.com/devintly/deviateproxy/issues](https://github.com/devintly/deviateproxy/issues)

---

# Политика конфиденциальности DeviateProxy

*Дата обновления: 18 сентября 2024 г.*

**DeviateProxy** — это расширение для браузера с открытым исходным кодом, предназначенное для выборочной маршрутизации сетевого трафика через указанные пользователем прокси-серверы на основе правил для доменов и импорта PAC/TXT-списков.

Мы уважаем конфиденциальность пользователей и защищаем её. Настоящая Политика конфиденциальности описывает, как расширение обращается с пользовательскими данными.

---

### 1. Отсутствие сбора и передачи данных
- DeviateProxy **не собирает, не отслеживает, не сохраняет на внешних серверах и не передаёт** никакие персональные данные, историю посещений, IP-адреса или любую идентифицирующую информацию.
- В коде расширения **полностью отсутствуют системы аналитики, телеметрии, рекламы или трекеры**.

### 2. Локальная обработка и хранение
Все конфигурации, правила и настройки хранятся и обрабатываются **исключительно локально на устройстве пользователя** с использованием стандартного API браузера (`chrome.storage.local` / `browser.storage.local`):
- **Учётные данные прокси:** логины и пароли для авторизации на прокси-серверах хранятся локально на вашем компьютере и передаются только напрямую на указанный вами прокси-сервер в момент сетевой аутентификации.
- **Списки правил и доменов:** пользовательские правила, импортированные списки TXT и скрипты PAC хранятся и исполняются строго локально.
- **Инспектор доменов вкладки:** список сетевых запросов и доменов во всплывающем окне расширения формируется динамически в оперативной памяти только для активной вкладки. Он никуда не передаётся и не сохраняется на постоянной основе.

### 3. Назначение запрашиваемых разрешений
DeviateProxy запрашивает минимальный набор разрешений, строго необходимый для работы заявленных функций:
- **`proxy`**: требуется для управления настройками прокси-серверов в браузере и маршрутизации трафика согласно вашим правилам.
- **`host_permissions` (`http://*/*`, `https://*/*`, `ws://*/*`, `wss://*/*`) и `webRequest`**: необходимы для сопоставления URL-адресов с вашими правилами маршрутизации, а также для отображения списка запросов в инспекторе активной вкладки.
- **`webRequestAuthProvider`**: требуется для передачи логина и пароля при запросе авторизации со стороны настроенного вами прокси-сервера.
- **`tabs`**: используется исключительно для получения адреса текущей активной вкладки с целью работы инспектора доменов и отображения счётчика проксированных запросов на иконке.
- **`storage` и `unlimitedStorage`**: необходимы для локального сохранения профилей прокси, списков правил и пользовательских настроек в браузере.
- **`alarms`**: используется для периодического фонового обновления внешних списков правил по расписанию (если настроено пользователем).
- **`offscreen`**: используется в браузерах на базе Chromium для изолированного выполнения PAC-скриптов в Manifest V3.

### 4. Взаимодействие с внешними серверами
DeviateProxy не отправляет запросы на какие-либо сторонние серверы, за исключением:
- Прямого соединения с прокси-серверами, настроенными самим пользователем.
- Загрузки списков правил по URL-адресам, которые пользователь самостоятельно добавил в настройках.

### 5. Открытый исходный код
Исходный код DeviateProxy полностью открыт и доступен для независимой проверки:  
[https://github.com/devintly/deviateproxy](https://github.com/devintly/deviateproxy)

### 6. Контакты
По любым вопросам относительно политики конфиденциальности вы можете создать обращение (issue) в репозитории проекта:  
[https://github.com/devintly/deviateproxy/issues](https://github.com/devintly/deviateproxy/issues)
