import { Route, Routes } from 'react-router-dom'
import { BackLink } from '../components/settings/SettingsUi'
import { ProfileHeader } from '../components/profile/ProfileHeader'
import { ProgressSection } from '../components/profile/ProgressSection'
import { SettingsList } from '../components/settings/SettingsList'
import AppearanceSettings from './more/AppearanceSettings'
import DataSettings from './more/DataSettings'
import DateSettings from './more/DateSettings'
import FoodSettings from './more/FoodSettings'
import IncomeSettings from './more/IncomeSettings'
import ProfileSettings from './more/ProfileSettings'
import SectionSettings from './more/SectionSettings'
import TrainingSettings from './more/TrainingSettings'

/** Your own space: who you are, how you're doing, then settings. Opened from the avatar on Today. */
function ProfileHome() {
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <BackLink to="/" label="Back to Today" text="Today" />
        <ProfileHeader />
      </div>
      <ProgressSection />
      <SettingsList />
    </div>
  )
}

export default function More() {
  return (
    <Routes>
      <Route index element={<ProfileHome />} />
      <Route path="profile" element={<ProfileSettings />} />
      <Route path="income" element={<IncomeSettings />} />
      <Route path="food" element={<FoodSettings />} />
      <Route path="training" element={<TrainingSettings />} />
      <Route path="dates" element={<DateSettings />} />
      <Route path="appearance" element={<AppearanceSettings />} />
      <Route path="sections" element={<SectionSettings />} />
      <Route path="data" element={<DataSettings />} />
    </Routes>
  )
}
