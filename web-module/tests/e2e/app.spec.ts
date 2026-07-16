import { expect, test } from '@playwright/test';

test('renders the upload interface', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Улучшение изображений' })).toBeVisible();
  await expect(page.getByText('JPG, PNG, HEIC, BMP')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Запустить' })).toBeDisabled();
});
