# Инструкция по установке зависимостей

## Проблема с PowerShell

Если вы получаете ошибку о политике выполнения скриптов в PowerShell, используйте один из вариантов ниже.

## Решение 1: Использовать командную строку (cmd) - РЕКОМЕНДУЕТСЯ

1. Откройте **командную строку** (cmd.exe), а не PowerShell
   - Нажмите `Win + R`
   - Введите `cmd` и нажмите Enter

2. Перейдите в директорию проекта:
   ```
   cd C:\pstock
   ```

3. Установите зависимости:
   ```
   npm install
   ```

## Решение 2: Изменить политику выполнения в PowerShell

Откройте PowerShell **от имени администратора** и выполните:

```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

Затем выполните:
```powershell
cd C:\pstock
npm install
```

## Решение 3: Обойти политику для одной команды

В PowerShell выполните:

```powershell
cd C:\pstock
powershell -ExecutionPolicy Bypass -Command "npm install"
```

## После установки зависимостей

После успешной установки (`npm install`) выполните:

1. **Миграции:**
   ```
   npm run migrate
   ```

2. **Создание администратора:**
   ```
   npm run create-admin
   ```

3. **Запуск бота и сервера** (в двух терминалах):
   ```
   npm start
   ```
   и
   ```
   npm run start:server
   ```


